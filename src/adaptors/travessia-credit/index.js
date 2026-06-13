const sdk = require('@defillama/sdk');
const utils = require('../utils');

const abis = {
    convertToAssets: 'function convertToAssets(uint256) view returns (uint256)',
    asset: 'function asset() view returns (address)',
    vault: 'function vault() view returns (address)',
    feeManager: 'function feeManager() view returns (address)',
    performanceFee: 'function performanceFee(address) view returns (uint256)',
    loan: 'function loan() view returns (tuple(uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256))',
}

const formatAmount = (value, decimals = 18) => (value == null ? null : Number(value) / 10 ** decimals);

async function getRawApy(loanAddresses, chain) {
    const loans = await sdk.api.abi.multiCall({
        abi: abis.loan,
        calls: loanAddresses.map(loanAddress => ({ target: loanAddress })),
        chain: chain,
    });
    return loans.output.map(loan => Number(loan.output[8]));
}

async function getPerformanceFee(feeManagers, loanAddresses, chain) {
    const performanceFees = await sdk.api.abi.multiCall({
        abi: abis.performanceFee,
        calls: loanAddresses.map((_, i) => ({ target: feeManagers[i], params: [loanAddresses[i]] })),
        chain: chain,
    });
    return performanceFees.output.map(performanceFee => Number(performanceFee.output));
}

async function getTVLAndBorrow(vaults, underlyings, chain) {
    const [supplies, decimals] = await Promise.all([
        sdk.api.abi.multiCall({ abi: 'erc20:totalSupply', calls: vaults.map(vault => ({ target: vault })), chain: chain }),
        sdk.api.abi.multiCall({ abi: 'erc20:decimals', calls: underlyings.map(underlying => ({ target: underlying })), chain: chain }),
    ]);

    const [totalAssets, liquidity] = await Promise.all([
        sdk.api.abi.multiCall({
            abi: abis.convertToAssets,
            calls: vaults.map((vault, i) => ({ target: vault, params: [supplies.output[i].output || 0] })),
            chain: chain,
        }),
        sdk.api.abi.multiCall({ abi: 'erc20:balanceOf', calls: vaults.map((vault, i) => ({ target: underlyings[i], params: [vault] })), chain: chain })
    ])

    const prices = await utils.getPrices(underlyings, chain)

    return vaults.map((_, i) => {
        const price = prices.pricesByAddress[underlyings[i].toLowerCase()] ?? 0;
        const tokenDecimals = Number(decimals.output[i].output || 18);
        const totalAssetsUsd = formatAmount(totalAssets.output[i].output, tokenDecimals) * price;
        const liquidityUsd = formatAmount(liquidity.output[i].output, tokenDecimals) * price;

        return {
            totalBorrowed: totalAssetsUsd - liquidityUsd,
            tvl: totalAssetsUsd,
        }
    })
}


const apy = async () => {
    const pools = [];
    const vaultData = await fetch("https://www.travessiacredit.com/api/vaults").then(r => r.json());

    const chains = [...new Set(vaultData.map(v => v.chainName).filter(Boolean))];

    for (const chain of chains) {
        const chainId = vaultData.find(v => v.chainName === chain).chainId;
        const data = vaultData.filter(v => v.chainName === chain).map(v => {
            return {
                vault: v.vaultAddress,
                feeManager: v.feeManagerAddress,
                asset: v.depositTokenAddress,
                loan: v.loanAddress,
                symbols: v.depositSymbol,
                partner: v.partner
            }
        });

        const [rawApy, performanceFees, tvlAndBorrow] = await Promise.all([
            getRawApy(data.map(a => a.loan), chain),
            getPerformanceFee(data.map(a => a.feeManager), data.map(a => a.loan), chain),
            getTVLAndBorrow(data.map(a => a.vault), data.map(a => a.asset), chain),
        ]);

        for (let i = 0; i < data.length; i++) {
            pools.push({
                pool: `${data[i].vault}-${chain}`.toLowerCase(),
                chain: utils.formatChain(chain),
                project: 'travessia-credit',
                symbol: data[i].symbols,
                underlyingTokens: [data[i].asset],
                tvlUsd: tvlAndBorrow[i].tvl,
                apyBase: (Number(rawApy[i]) * (1 - Number(performanceFees[i]) / 1e6)) / 1e4,
                url: `https://www.travessiacredit.com/vaults/${chainId}/${data[i].partner}/${data[i].vault}`,
            });
        }
    }

    return pools;
}

module.exports = {
    timetravel: false,
    apy,
    url: "https://www.travessiacredit.com",
};
