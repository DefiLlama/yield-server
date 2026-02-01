const sdk = require('@defillama/sdk');
const utils = require('../utils');

const API_URL = 'https://yield.accountable.capital/api/loan';
const chainIdToName = { 143: 'monad' };
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const abis = {
    asset: 'function asset() view returns (address)',
    convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
};

const basisPointsToPercent = (value) => Number(value) / 1e4;
const formatAmount = (value, decimals = 18) => (value == null ? null : Number(value) / 10 ** decimals);

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
            totalSupplied: supplies[i],
            totalBorrowed: Number(totalAssets[i]) - Number(liquidity[i] || 0),
            tvl: liquidity[i],
        };
        return acc;
    }, {});
};

const fetchBreakdowns = async(loanIds) => {
    const results = await Promise.allSettled(
        loanIds.map((id) => utils.getData(`${API_URL}/${id}/apy/breakdown`))
    );

    return results.reduce((acc, res, idx) => {
        if (res.status !== 'fulfilled') return acc;
        acc[loanIds[idx]] = res.value || {};
        return acc;
    }, {});
};

const apy = async() => {
    const { items } = await utils.getData(API_URL);
    const activeLoans = items.filter((item) => item.loan_state === 3);
    const loanIds = activeLoans.map((item) => item.id);

    const loanVaultMap = await fetchVaultsByLoanIds(loanIds);
    const vaultAddresses = Object.values(loanVaultMap);
    const vaultStats = await getVaultStats(vaultAddresses);
    const breakdowns = await fetchBreakdowns(loanIds);

    return Promise.all(
        activeLoans.map(async(item) => {
            const chainName = chainIdToName[item.chain_id] || 'unknown';
            const vaultAddress = loanVaultMap[item.id];
            const stats = vaultAddress ? vaultStats[vaultAddress] || {} : {};
            const pointBoosts = item?.all_points_apy_boost?.boosts_by_points || [];

            const breakdown = breakdowns[item.id]?.main || {};

            const interestRate = Number(breakdown?.interest_rate);
            const perfFeePctRaw = Number(breakdown?.performance_fee_percentage);
            const perfFeePct =
                !Number.isNaN(perfFeePctRaw) && perfFeePctRaw > 1 ? perfFeePctRaw / 100 : perfFeePctRaw;
            const perfFeePoints = Number(breakdown?.performance_fee_points);
            const netInterest = breakdown?.net_interest_rate;
            const baseApy =
                netInterest != null
                    ? Number(netInterest)
                    : !Number.isNaN(interestRate) && !Number.isNaN(perfFeePct)
                        ? interestRate * (1 - perfFeePct)
                        : !Number.isNaN(interestRate) && !Number.isNaN(perfFeePoints)
                            ? interestRate - perfFeePoints
                            : basisPointsToPercent(item.apy);

            const merklApy = Number(breakdown?.merkl_apy_boost?.total_apr ?? breakdown?.merkle_apy ?? 0);
            const pointBoostsFromBreakdown = breakdown?.points_apy_boost?.boosts_by_points || pointBoosts;
            const pointRewardApyFromBreakdown =
                breakdown?.points_apy_boost?.total_apy_boost_percent ??
                pointBoostsFromBreakdown.reduce((sum, b) => sum + Number(b?.apy_boost_percent || 0), 0);
            const pointRewardTokens = pointBoostsFromBreakdown.map((b) => b?.point_name).filter(Boolean);

            const merklTokens =
                breakdown?.merkl_apy_boost?.tokens?.map((t) => t?.address?.toLowerCase()).filter(Boolean) || [];

            const rewardsBoost = Number(breakdown?.rewards_apy_boost?.total_apy_boost_percent ?? 0);
            const rewardBoostTokens =
                breakdown?.rewards_apy_boost?.boosts_by_token
                    ?.map((b) => b?.token?.address || b?.address || b?.token_address)
                    .filter(Boolean)
                    .map((addr) => addr.toLowerCase()) || [];

            const totalApyReward = merklApy + pointRewardApyFromBreakdown + rewardsBoost || null;
            const combinedRewardTokens = Array.from(
                new Set([...(merklTokens || []), ...rewardBoostTokens, ...pointRewardTokens])
            );

            return {
                pool: `${item.loan_address}-${chainName}`.toLowerCase(),
                chain: utils.formatChain(chainName),
                project: 'accountable',
                symbol: utils.formatSymbol(item.asset_symbol),
                tvlUsd: formatAmount(stats.tvl, 6),
                apyBase: baseApy,
                apyReward: totalApyReward,
                rewardTokens: combinedRewardTokens,
                url: `https://yield.accountable.capital/vaults/${item.loan_address}`,
                totalSupplyUsd: formatAmount(stats.totalSupplied, 6),
                totalBorrowUsd: formatAmount(stats.totalBorrowed, 6),
            };
        })
    );
};

module.exports = {
    timetravel: false,
    apy,
};
