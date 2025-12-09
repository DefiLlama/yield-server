const sdk = require('@defillama/sdk');
const utils = require('../utils');

const API_URL = 'https://yield.accountable.capital/api/loan';
const chainIdToName = { 143: 'monad' };
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const abis = {
    asset: 'function asset() view returns (address)',
    convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
    decimals: 'function decimals() view returns (uint8)',
};

const basisPointsToPercent = (value) => Number(value) / 1e4;
const formatAmountWithDecimlas = (value, decimals) => value / 10 ** decimlas;

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
    console.log(totalAssets, liquidity);
    return vaults.reduce((acc, address, i) => {
        acc[address] = {
            totalSupplied: supplies[i],
            totalBorrowed: totalAssets[i] - liquidity[i],
            tvl: liquidity[i],
        };
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

    return activeLoans.map((item) => {
        const chainName = chainIdToName[item.chain_id] || 'unknown';
        const vaultAddress = loanVaultMap[item.id];
        const stats = vaultAddress ? vaultStats[vaultAddress] || {} : {};

        return {
            pool: `${item.loan_address}-${chainName}`.toLowerCase(),
            chain: chainName,
            project: 'accountable',
            symbol: utils.formatSymbol(item.asset_symbol),
            tvlUsd: formatAmountWithDecimlas(stats.tvl, 6),
            apyBase: basisPointsToPercent(item.net_apy),
            url: `https://yield.accountable.capital/vaults/${item.loan_address}`,
            totalSupplyUsd: formatAmountWithDecimlas(stats.totalSupplied, 6),
            totalBorrowUsd: formatAmountWithDecimlas(stats.totalBorrowe, 6),
        };
    });
};

module.exports = {
    timetravel: false,
    apy,
};