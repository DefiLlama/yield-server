const sdk = require('@defillama/sdk');
const utils = require('../utils');

const API_URL = 'https://yield.accountable.capital/api/loan';
const chainIdToName = { 1: 'ethereum', 143: 'monad', 4114: 'citrea' };
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const abis = {
    asset: 'function asset() view returns (address)',
    convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
};

const fetchVaultsByLoanIds = async(loanIds) => {
    const results = await Promise.allSettled(
        loanIds.map((id) => utils.getData(`${API_URL}/${id}`))
    );

    return results.reduce((acc, res, idx) => {
        if (res.status !== 'fulfilled') return acc;
        const vault = res.value.on_chain_loan.loan.vault;
        if (vault && vault !== ZERO_ADDRESS)
            acc[loanIds[idx]] = vault.toLowerCase();
        return acc;
    }, {});
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
    const loanIds = activeLoans.map((item) => item.id);

    const loanVaultMap = await fetchVaultsByLoanIds(loanIds);

    const vaultsByChain = {};
    activeLoans.forEach((item) => {
        const vault = loanVaultMap[item.id];
        if (!vault) return;
        const chain = chainIdToName[item.chain_id];
        (vaultsByChain[chain] ||= new Set()).add(vault);
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
    Object.entries(vaultStats).forEach(([key, s]) => {
        if (!s.underlying) return;
        const chain = key.split(':')[0];
        (underlyingsByChain[chain] ||= new Set()).add(s.underlying.toLowerCase());
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
            const vaultAddress = loanVaultMap[item.id];
            const stats = vaultAddress ? vaultStats[`${chainName}:${vaultAddress}`] || {} : {};
            const d = Number(item.asset_decimals);
            const decimals = Number.isFinite(d) ? d : null;
            const underlying = stats.underlying?.toLowerCase();
            const priceUsd = underlying ? pricesByChainToken[`${chainName}:${underlying}`] : undefined;
            const toUsd = (raw) => {
                if (raw == null || decimals == null || priceUsd == null) return null;
                return (Number(raw) / 10 ** decimals) * priceUsd;
            };
            const rewardBoostPct = Number(item?.rewards_apy_boost?.total_apy_boost_percent ?? 0);
            const pointBoostPct = Number(item?.all_points_apy_boost?.total_apy_boost_percent ?? 0);

            const baseApy =
                item.apy_inception_annualized != null
                    ? Number(item.apy_inception_annualized)
                    : item.net_apy != null
                        ? Number(item.net_apy) - (rewardBoostPct + pointBoostPct)
                        : null;

            const rewardTokens = Array.from(
                new Set([
                    ...(item?.rewards_apy_boost?.boosts_by_token || [])
                        .map((b) => b?.token_address)
                        .filter(Boolean)
                        .map((addr) => addr.toLowerCase()),
                    ...(item?.all_points_apy_boost?.boosts_by_points || [])
                        .map((b) => b?.point_name)
                        .filter(Boolean),
                ])
            );

            const apyReward = rewardTokens.length ? rewardBoostPct + pointBoostPct || null : null;

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
                url: `https://yield.accountable.capital/vaults/${item.loan_address}`,
                totalSupplyUsd: toUsd(stats.totalAssets) ?? undefined,
                totalBorrowUsd: toUsd(stats.totalBorrowed) ?? undefined,
                underlyingTokens: stats.underlying ? [stats.underlying] : undefined,
            };
        })
    );
};

module.exports = {
    timetravel: false,
    apy,
};
