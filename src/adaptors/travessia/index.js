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

const LOAN_ADDRESSES = {
    monad: [
        '0xB52fB6B4FdA374859A21988Ed48bF0DdC8d95e30', // AUSD Tauri
    ],
    ethereum: [
        '0x93F0b21693Bf992417317B4074Af4eE10d4E7D3a', // AUSD Tauri
    ],
}

const ADDRESS_TO_SYMBOL = {
    '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a': 'AUSD',
}

const CHAIN_TO_ID = {
    monad: 143,
    ethereum: 1,
}

const basisPointsToPercent = (value) => Number(value) / 1e4;
const formatAmount = (value, decimals = 18) => (value == null ? null : Number(value) / 10 ** decimals);


async function getAddresses(loanAddresses, chain) {
    const [vaults, assets, feeManagers] = await Promise.all([abis.vault, abis.asset, abis.feeManager].map(abi =>
        sdk.api.abi.multiCall({
            abi: abi,
            calls: loanAddresses.map(loanAddress => ({ target: loanAddress })),
            chain: chain
        })
    ))
    return loanAddresses.map((_, i) => ({
        vault: vaults.output[i].output,
        asset: assets.output[i].output,
        feeManager: feeManagers.output[i].output,
    }))
}


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

    const chains = Object.keys(LOAN_ADDRESSES);
    for (const chain of chains) {
        const addresses = await getAddresses(LOAN_ADDRESSES[chain], chain);
        const rawApy = await getRawApy(LOAN_ADDRESSES[chain], chain);
        const performanceFees = await getPerformanceFee(addresses.map(a => a.feeManager), LOAN_ADDRESSES[chain], chain);
        const tvlAndBorrow = await getTVLAndBorrow(addresses.map(a => a.vault), addresses.map(a => a.asset), chain);

        for (let i = 0; i < addresses.length; i++) {
            pools.push({
                pool: `${addresses[i].vault}-${chain}`.toLowerCase(),
                chain: chain,
                project: 'travessia',
                symbol: ADDRESS_TO_SYMBOL[addresses[i].asset],
                underlyingTokens: [addresses[i].asset],
                tvlUsd: formatAmount(tvlAndBorrow[i].tvl, 6),
                totalBorrowUsd: formatAmount(tvlAndBorrow[i].totalBorrowed, 6),
                apyBase: (Number(rawApy[i]) * (1 - Number(performanceFees[i]) / 1e6)) / 1e4,
                apyReward: 0,
                rewardTokens: [],
                url: `https://www.travessiacredit.com/vaults/${CHAIN_TO_ID[chain]}/tauri/${addresses[i].vault}`,
            });
        }
    }

    return pools;
}

module.exports = {
    timetravel: false,
    apy,
};
