const sdk = require('@defillama/sdk');
const utils = require('../utils');

const API_URL = 'https://yield.accountable.capital/api/loan';
const chainIdToName = { 1: 'ethereum', 143: 'monad', 4114: 'citrea' };
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const abis = {
    asset: 'function asset() view returns (address)',
    convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
    vault: 'function vault() view returns (address)',
};

// Resolve each loan's vault + underlying on-chain. The loan contract exposes
// both vault() and asset(), so one multicall per chain replaces a per-loan API
// request each. The marketplace API rate-limits those bursts (503), and a
// dropped response previously left the pool with no vault -> no on-chain stats
// (undefined totalSupplyUsd / totalBorrowUsd / underlyingTokens).
const fetchLoanMeta = async(loansByChain) => {
    const map = {};
    await Promise.all(
        Object.entries(loansByChain).map(async([chain, loans]) => {
            const [vaultsRes, assetsRes] = await Promise.all([
                sdk.api.abi.multiCall({
                    chain,
                    abi: abis.vault,
                    calls: loans.map((l) => ({ target: l.loan_address })),
                    permitFailure: true,
                }),
                sdk.api.abi.multiCall({
                    chain,
                    abi: abis.asset,
                    calls: loans.map((l) => ({ target: l.loan_address })),
                    permitFailure: true,
                }),
            ]);
            loans.forEach((l, i) => {
                const vault = vaultsRes.output[i].output;
                const asset = assetsRes.output[i].output;
                if (vault && vault !== ZERO_ADDRESS)
                    map[l.id] = {
                        vault: vault.toLowerCase(),
                        asset: asset || null,
                    };
            });
        })
    );
    return map;
};

const getVaultAddressesFromApi = async() => {
    const { items } = await utils.getData(API_URL);
    const vaults = items
        .map((item) => item.on_chain_loan.loan.vault)
        .filter((addr) => addr && addr !== ZERO_ADDRESS)
        .map((addr) => addr.toLowerCase());
    return Array.from(new Set(vaults));
};

const getVaultStats = async(vaults, chain = 'monad') => {
    if (!vaults.length) return {};

    const [suppliesRes, underlyingsRes] = await Promise.all([
        sdk.api.abi.multiCall({
            chain,
            abi: 'erc20:totalSupply',
            calls: vaults.map((vault) => ({ target: vault })),
            permitFailure: true,
        }),
        sdk.api.abi.multiCall({
            chain,
            abi: abis.asset,
            calls: vaults.map((vault) => ({ target: vault })),
            permitFailure: true,
        }),
    ]);

    const supplies = suppliesRes.output.map((o) => o.output);
    const underlyings = underlyingsRes.output.map((o) => o.output);

    const [totalAssetsRes, liquidityRes] = await Promise.all([
        sdk.api.abi.multiCall({
            chain,
            abi: abis.convertToAssets,
            calls: vaults.map((vault, i) => ({
                target: vault,
                params: [supplies[i]],
            })),
            permitFailure: true,
        }),
        sdk.api.abi.multiCall({
            chain,
            abi: 'erc20:balanceOf',
            calls: vaults.map((vault, i) => ({
                target: underlyings[i],
                params: vault,
            })),
            permitFailure: true,
        }),
    ]);

    const totalAssets = totalAssetsRes.output.map((o) => o.output);
    const liquidity = liquidityRes.output.map((o) => o.output);
    return vaults.reduce((acc, address, i) => {
        acc[address] = {
            totalAssets: totalAssets[i],
            totalBorrowed: Number(totalAssets[i]) - Number(liquidity[i] || 0),
            tvl: liquidity[i],
            underlying: underlyings[i],
        };
        return acc;
    }, {});
};

const apy = async() => {
    const { items } = await utils.getData(API_URL);
    const activeLoans = items.filter(
        (item) => item.loan_state === 3 && chainIdToName[item.chain_id]
    );

    const loansByChain = {};
    activeLoans.forEach((item) => {
        const chain = chainIdToName[item.chain_id];
        (loansByChain[chain] ||= []).push(item);
    });
    const loanMetaMap = await fetchLoanMeta(loansByChain);

    const vaultsByChain = {};
    activeLoans.forEach((item) => {
        const meta = loanMetaMap[item.id];
        if (!meta) return;
        const chain = chainIdToName[item.chain_id];
        (vaultsByChain[chain] ||= new Set()).add(meta.vault);
    });
    const vaultStats = {};
    await Promise.all(
        Object.entries(vaultsByChain).map(async([chain, vaultSet]) => {
            const stats = await getVaultStats(Array.from(vaultSet), chain);
            for (const [address, s] of Object.entries(stats)) {
                vaultStats[`${chain}:${address}`] = s;
            }
        })
    );

    const underlyingsByChain = {};
    activeLoans.forEach((item) => {
        const meta = loanMetaMap[item.id];
        if (!meta?.asset) return;
        const chain = chainIdToName[item.chain_id];
        (underlyingsByChain[chain] ||= new Set()).add(meta.asset.toLowerCase());
    });
    const pricesByChainToken = {};
    await Promise.all(
        Object.entries(underlyingsByChain).map(async([chain, addressSet]) => {
            const { pricesByAddress } = await utils.getPrices(Array.from(addressSet), chain);
            for (const [address, price] of Object.entries(pricesByAddress)) {
                pricesByChainToken[`${chain}:${address.toLowerCase()}`] = price;
            }
        })
    );

    return Promise.all(
        activeLoans.map(async(item) => {
            const chainName = chainIdToName[item.chain_id];
            const meta = loanMetaMap[item.id];
            const vaultAddress = meta?.vault;
            const stats = vaultAddress ? vaultStats[`${chainName}:${vaultAddress}`] || {} : {};
            const d = Number(item.asset_decimals);
            const decimals = Number.isFinite(d) ? d : null;
            const underlying = meta?.asset || stats.underlying;
            const priceUsd = underlying
                ? pricesByChainToken[`${chainName}:${underlying.toLowerCase()}`]
                : undefined;
            const toUsd = (raw) => {
                if (raw == null || decimals == null || priceUsd == null) return null;
                return (Number(raw) / 10 ** decimals) * priceUsd;
            };
            const rewardBoostPct = Number(item?.rewards_apy_boost?.total_apy_boost_percent ?? 0);
            const pointBoostPct = Number(item?.all_points_apy_boost?.total_apy_boost_percent ?? 0);

            // Share-price (yield-strategy / NAV) vaults expose rolling-window net
            // APY. Use the 7d window, falling back to 30d. We do NOT fall back to
            // since-inception (maintainer caps the horizon at 30d), so a NAV vault
            // younger than 7d reports no apyBase until a 7d/30d window exists.
            // A non-null apy_inception_annualized is only the discriminator for NAV
            // vaults here (contractual open/fixed-term vaults also carry apy_7d, so
            // it can't be used for detection); they take the net_apy path.
            const navWindowApy = item.apy_7d ?? item.apy_30d;
            const baseApy =
                item.apy_inception_annualized != null
                    ? (navWindowApy != null ? Number(navWindowApy) : null)
                    : item.net_apy != null
                        ? Number(item.net_apy) - (rewardBoostPct + pointBoostPct)
                        : null;

            // Rewards must be live tokens only (DefiLlama policy). Points (e.g.
            // ACC, not yet launched) are excluded from apyReward / rewardTokens
            // and surfaced via poolMeta instead.
            const rewardTokens = Array.from(
                new Set(
                    (item?.rewards_apy_boost?.boosts_by_token || [])
                        .map((b) => b?.token_address)
                        .filter(Boolean)
                        .map((addr) => addr.toLowerCase())
                )
            );

            const apyReward = rewardTokens.length ? rewardBoostPct || null : null;

            const pointNames = (item?.all_points_apy_boost?.boosts_by_points || [])
                .map((b) => b?.point_name)
                .filter(Boolean);
            const poolMeta = pointNames.length
                ? `Earn ${pointNames.map((n) => n.replace(/\s*points?$/i, '')).join(', ')} Points`
                : undefined;

            return {
                pool: `${item.loan_address}-${chainName}`.toLowerCase(),
                chain: utils.formatChain(chainName),
                project: 'accountable',
                symbol: item.asset_symbol,
                // Vault size (total deposited), straight from the API. These
                // credit vaults run ~fully lent, so the on-chain idle-liquidity
                // figure is ~$0 and would hide them below DefiLlama's thresholds.
                tvlUsd: item.tvl_in_usd ?? null,
                apyBase: baseApy,
                apyReward,
                rewardTokens,
                poolMeta,
                url: `https://yield.accountable.capital/vaults/${item.loan_address}`,
                totalSupplyUsd: toUsd(stats.totalAssets) ?? undefined,
                totalBorrowUsd: toUsd(stats.totalBorrowed) ?? undefined,
                underlyingTokens: underlying ? [underlying] : undefined,
            };
        })
    );
};

module.exports = {
  protocolId: '7092',
    timetravel: false,
    apy,
};
