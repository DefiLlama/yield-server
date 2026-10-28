const sdk = require('@defillama/sdk');
const utils = require('../utils');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const abis = {
    convertToAssets: 'function convertToAssets(uint256) view returns (uint256)',
    totalAssets: 'function totalAssets() view returns (uint256)',
    feeManager: 'function feeManager() view returns (address)',
    performanceFee: 'function performanceFee(address) view returns (uint256)',
    loan: 'function loan() view returns (tuple(uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256))',
}

const NULL_STATS = { tvl: null, totalBorrowed: null, apyBase: null };

const formatAmount = (value, decimals = 18) => (value == null ? null : Number(value) / 10 ** decimals);

// DefiLlama's SDK lists Avalanche as `avax`. The vault API uses `avalanche`.
const toSdkChain = (chain) => (chain === 'avalanche' ? 'avax' : chain);

const outputAt = (result, i) => result.output[i]?.output;

async function getAccountableStats(vaults, loans, underlyings, apiApys, chain) {
    const [supplies, decimals, loanTerms, feeManagers] = await Promise.all([
        sdk.api.abi.multiCall({ abi: 'erc20:totalSupply', calls: vaults.map(vault => ({ target: vault })), chain: chain, permitFailure: true }),
        sdk.api.abi.multiCall({ abi: 'erc20:decimals', calls: underlyings.map(underlying => ({ target: underlying })), chain: chain, permitFailure: true }),
        sdk.api.abi.multiCall({ abi: abis.loan, calls: loans.map(loan => ({ target: loan })), chain: chain, permitFailure: true }),
        sdk.api.abi.multiCall({ abi: abis.feeManager, calls: loans.map(loan => ({ target: loan })), chain: chain, permitFailure: true }),
    ]);

    const [nav, liquidity, performanceFees] = await Promise.all([
        sdk.api.abi.multiCall({
            abi: abis.convertToAssets,
            calls: vaults.map((vault, i) => ({ target: vault, params: [outputAt(supplies, i) || 0] })),
            chain: chain,
            permitFailure: true,
        }),
        sdk.api.abi.multiCall({
            abi: 'erc20:balanceOf',
            calls: vaults.map((vault, i) => ({ target: underlyings[i], params: [vault] })),
            chain: chain,
            permitFailure: true,
        }),
        sdk.api.abi.multiCall({
            abi: abis.performanceFee,
            calls: loans.map((loan, i) => ({
                target: outputAt(feeManagers, i) || ZERO_ADDRESS,
                params: [loan],
            })),
            chain: chain,
            permitFailure: true,
        }),
    ]);

    const prices = await utils.getPrices(underlyings, chain);

    return vaults.map((_, i) => {
        const supply = outputAt(supplies, i);
        const decimal = outputAt(decimals, i);
        const loan = outputAt(loanTerms, i);
        const assets = outputAt(nav, i);
        const idle = outputAt(liquidity, i);
        const rate = loan?.[8];
        if ([supply, decimal, assets, idle, rate].some(value => value == null)) return { ...NULL_STATS };

        const price = prices.pricesByAddress[underlyings[i].toLowerCase()] ?? 0;
        const tokenDecimals = Number(decimal);
        const navUsd = formatAmount(assets, tokenDecimals) * price;
        const idleUsd = formatAmount(idle, tokenDecimals) * price;
        const fee = outputAt(performanceFees, i);
        const apiApy = apiApys[i];

        return {
            tvl: navUsd,
            totalBorrowed: Math.max(0, navUsd - idleUsd),
            apyBase: fee == null
                ? (apiApy == null ? null : Number(apiApy) * 100)
                : (Number(rate) * (1 - Number(fee) / 1e6)) / 1e4,
        };
    });
}

async function getLinearStats(vaults, underlyings, chain) {
    const [totalAssets, decimals] = await Promise.all([
        sdk.api.abi.multiCall({ abi: abis.totalAssets, calls: vaults.map(vault => ({ target: vault })), chain: chain, permitFailure: true }),
        sdk.api.abi.multiCall({ abi: 'erc20:decimals', calls: underlyings.map(underlying => ({ target: underlying })), chain: chain, permitFailure: true }),
    ]);

    const prices = await utils.getPrices(underlyings, chain);

    return vaults.map((_, i) => {
        const assets = outputAt(totalAssets, i);
        const decimal = outputAt(decimals, i);
        if (assets == null || decimal == null) return null;

        const price = prices.pricesByAddress[underlyings[i].toLowerCase()] ?? 0;
        const tokenDecimals = Number(decimal);

        return {
            tvl: formatAmount(assets, tokenDecimals) * price,
            totalBorrowed: 0,
        };
    });
}

const apy = async () => {
    const pools = [];
    const vaultData = await fetch("https://www.travessiacredit.com/api/vaults").then(r => r.json());

    const chains = [...new Set(vaultData.map(v => v.chainName).filter(Boolean))];

    for (const chain of chains) {
        const chainId = vaultData.find(v => v.chainName === chain).chainId;
        const sdkChain = toSdkChain(chain);
        const data = vaultData.filter(v => v.chainName === chain).map(v => {
            return {
                vault: v.vaultAddress,
                asset: v.depositTokenAddress,
                loan: v.loanAddress,
                symbols: v.depositSymbol,
                partner: v.partner,
                apy: v.apy,
                vaultType: v.vaultType,
            }
        });

        const accountable = [];
        const linear = [];
        data.forEach((row, i) => {
            (row.vaultType === 'linear' ? linear : accountable).push({ ...row, i });
        });

        const [accountableStats, linearStats] = await Promise.all([
            accountable.length
                ? getAccountableStats(
                    accountable.map(row => row.vault),
                    accountable.map(row => row.loan),
                    accountable.map(row => row.asset),
                    accountable.map(row => row.apy),
                    sdkChain,
                )
                : [],
            linear.length
                ? getLinearStats(
                    linear.map(row => row.vault),
                    linear.map(row => row.asset),
                    sdkChain,
                )
                : [],
        ]);

        const stats = new Array(data.length);
        accountable.forEach((row, j) => { stats[row.i] = accountableStats[j]; });
        linear.forEach((row, j) => {
            if (!linearStats[j]) return;
            stats[row.i] = {
                ...linearStats[j],
                apyBase: row.apy == null ? null : Number(row.apy) * 100,
            };
        });

        for (let i = 0; i < data.length; i++) {
            if (!stats[i]) continue;
            const apyBase = stats[i].apyBase;
            if (!Number.isFinite(apyBase)) continue;

            pools.push({
                pool: `${data[i].vault}-${chain}`.toLowerCase(),
                chain: utils.formatChain(chain),
                project: 'travessia-credit',
                symbol: data[i].symbols,
                underlyingTokens: [data[i].asset],
                tvlUsd: stats[i].tvl,
                totalBorrowUsd: stats[i].totalBorrowed,
                apyBase,
                url: `https://www.travessiacredit.com/vaults/${chainId}/${data[i].partner}/${data[i].vault}`,
            });
        }
    }

    return pools;
}

module.exports = {
    protocolId: '7674',
    timetravel: false,
    apy,
    url: "https://www.travessiacredit.com",
};
