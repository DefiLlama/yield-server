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

const basisPointsToPercent = (value) => Number(value) / 1e4;
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
    const supplies = await sdk.api.abi.multiCall({ abi: 'erc20:totalSupply', calls: vaults.map(vault => ({ target: vault })), chain: chain })

    const [totalAssets, liquidity] = await Promise.all([
        sdk.api.abi.multiCall({
            abi: abis.convertToAssets,
            calls: vaults.map((vault, i) => ({ target: vault, params: [supplies.output[i].output || 0] })),
            chain: chain,
        }),
        sdk.api.abi.multiCall({ abi: 'erc20:balanceOf', calls: vaults.map((vault, i) => ({ target: underlyings[i], params: vault })), chain: chain })
    ])

    const prices = await utils.getPrices(underlyings, chain)

    return vaults.map((_, i) => {
        return {
            totalBorrowed: (Number(totalAssets.output[i].output) - Number(liquidity.output[i].output)) * prices.pricesByAddress[underlyings[i].toLowerCase()],
            tvl: (Number(totalAssets.output[i].output)) * prices.pricesByAddress[underlyings[i].toLowerCase()],
        }
    })
}


const apy = async () => {
    const pools = [];
    const vaultData = await fetch("https://www.travessiacredit.com/api/vaults").then(r => r.json());

    const chains = [...new Set(vaultData.map(v => v.chainName).filter(Boolean))];

    for (const chain of chains) {
        const chainId = vaultData.find(v => v.chainName === chain).chainId;
        const addresses = vaultData.filter(v => v.chainName === chain).map(v => {
            return {
                vault: v.vaultAddress,
                feeManager: v.feeManagerAddress,
                asset: v.depositTokenAddress,
                loan: v.loanAddress,
            }
        });
        const symbols = vaultData.filter(v => v.chainName === chain).map(v => v.depositSymbol);
        const rawApy = await getRawApy(addresses.map(a => a.loan), chain);
        const performanceFees = await getPerformanceFee(addresses.map(a => a.feeManager), addresses.map(a => a.loan), chain);
        const tvlAndBorrow = await getTVLAndBorrow(addresses.map(a => a.vault), addresses.map(a => a.asset), chain);

        for (let i = 0; i < addresses.length; i++) {
            pools.push({
                pool: `${addresses[i].vault}-${chain}`.toLowerCase(),
                chain: utils.formatChain(chain),
                project: 'travessia',
                symbol: utils.formatSymbol(symbols[i]),
                underlyingTokens: [addresses[i].asset],
                tvlUsd: formatAmount(tvlAndBorrow[i].tvl, 6),
                totalBorrowUsd: formatAmount(tvlAndBorrow[i].totalBorrowed, 6),
                apyBase: (Number(rawApy[i]) * (1 - Number(performanceFees[i]) / 1e6)) / 1e4,
                apyReward: 0,
                rewardTokens: [],
                url: `https://www.travessiacredit.com/vaults/${chainId}/tauri/${addresses[i].vault}`,
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
