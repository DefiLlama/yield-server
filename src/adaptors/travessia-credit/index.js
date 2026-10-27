const sdk = require('@defillama/sdk');
const utils = require('../utils');

const abis = {
    convertToAssets: 'function convertToAssets(uint256) view returns (uint256)',
    totalAssets: 'function totalAssets() view returns (uint256)',
    loan: 'function loan() view returns (tuple(uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256))',
}

const formatAmount = (value, decimals = 18) => (value == null ? null : Number(value) / 10 ** decimals);

// DefiLlama's SDK lists Avalanche as `avax`. The vault API uses `avalanche`.
const toSdkChain = (chain) => (chain === 'avalanche' ? 'avax' : chain);

async function getAccountableStats(vaults, loans, underlyings, chain) {
    const [supplies, decimals, loanTerms] = await Promise.all([
        sdk.api.abi.multiCall({ abi: 'erc20:totalSupply', calls: vaults.map(vault => ({ target: vault })), chain: chain }),
        sdk.api.abi.multiCall({ abi: 'erc20:decimals', calls: underlyings.map(underlying => ({ target: underlying })), chain: chain }),
        sdk.api.abi.multiCall({ abi: abis.loan, calls: loans.map(loan => ({ target: loan })), chain: chain }),
    ]);

    const nav = await sdk.api.abi.multiCall({
        abi: abis.convertToAssets,
        calls: vaults.map((vault, i) => ({ target: vault, params: [supplies.output[i].output || 0] })),
        chain: chain,
    });

    const prices = await utils.getPrices(underlyings, chain);

    return vaults.map((_, i) => {
        const price = prices.pricesByAddress[underlyings[i].toLowerCase()] ?? 0;
        const tokenDecimals = Number(decimals.output[i].output || 18);
        const loan = loanTerms.output[i].output;

        return {
            tvl: formatAmount(nav.output[i].output, tokenDecimals) * price,
            totalBorrowed: formatAmount(loan[5], tokenDecimals) * price,
            apyBase: Number(loan[8]) / 1e4,
        };
    });
}

async function getLinearStats(vaults, underlyings, chain) {
    const [totalAssets, decimals] = await Promise.all([
        sdk.api.abi.multiCall({ abi: abis.totalAssets, calls: vaults.map(vault => ({ target: vault })), chain: chain }),
        sdk.api.abi.multiCall({ abi: 'erc20:decimals', calls: underlyings.map(underlying => ({ target: underlying })), chain: chain }),
    ]);

    const prices = await utils.getPrices(underlyings, chain);

    return vaults.map((_, i) => {
        const price = prices.pricesByAddress[underlyings[i].toLowerCase()] ?? 0;
        const tokenDecimals = Number(decimals.output[i].output || 18);

        return {
            tvl: formatAmount(totalAssets.output[i].output, tokenDecimals) * price,
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
            stats[row.i] = {
                ...linearStats[j],
                apyBase: row.apy == null ? null : Number(row.apy) * 100,
            };
        });

        for (let i = 0; i < data.length; i++) {
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
