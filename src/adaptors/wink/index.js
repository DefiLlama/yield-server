const utils = require('../utils');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const { getProvider } = require('@defillama/sdk/build/general');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');

const WINK_TOKEN_ADDRESS = '0x8c3441E7B9aA8A30a542DDE048dd067DE2802E9B'

const USDW_TOKEN_ADDRESS = '0xab670FDfb0060BDC6508B84a309ff41b56CCAf3f'

const LOCK_WINK_ADDRESS = '0x49C4EeC1d4fFFcdFF415E0757F01Cc50eeF5d4FD'
const LOCK_WINK_ABI = [{"inputs": [],"name": "rebaser","outputs": [{"internalType": "address","name": "","type": "address"}],"stateMutability": "view","type": "function"}]

const LOCK_USDW_ADDRESS = '0x231fB0E6AD5d975151fC8d5b5C5EB164D265fE85'
const LOCK_USDW_ABI = [{"inputs": [{"internalType": "enum LockUSDW.LockPeriod","name": "","type": "uint8"}],"name": "lockAPY","outputs": [{"internalType": "uint256","name": "","type": "uint256"}],"stateMutability": "view","type": "function"},]

const S_USDW_ADDRESS = '0xfB379c1f5431E8065e987B36C9BDAF93cba18740'
const S_USDW_ABI = [{"inputs": [],"name": "ssr","outputs": [{"internalType": "uint256","name": "","type": "uint256"}],"stateMutability": "view","type": "function"}]


const chain = 'polygon';
const provider = getProvider(chain);

const YEAR = 365 * 24 * 60 * 60;
const REBASE_OBSERVATION_PERIOD = 60 * 60;

const winkTokenInterface = new ethers.utils.Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

async function getPrices(chain, addresses) {
    const priceKeys = [...new Set(addresses)].map(
            (address) => `${chain}:${address}`
    );
    return (
        await superagent.get(
            `https://coins.llama.fi/prices/current/${priceKeys
                .join(',')
                .toLowerCase()}`
        )
    ).body.coins;
}

const getRebaserTopic = async () => {
    return (
        await sdk.api.abi.call({
            abi: LOCK_WINK_ABI.find((abi) => abi.name == 'rebaser'),
            target: LOCK_WINK_ADDRESS,
            chain,
        })
    ).output.replace('0x', '0x000000000000000000000000');
}

const getLockWinkBalance = async () => {
    return (
        await sdk.api.abi.call({
            abi: 'erc20:balanceOf',
            target: WINK_TOKEN_ADDRESS,
            params: [LOCK_WINK_ADDRESS],
            chain,
        })
    ).output
}

const getLockWinkApy = async (fromBlock, toBlock, lockedAmount) => {

    const rebases = (
        await sdk.api2.util.getLogs({
            target: WINK_TOKEN_ADDRESS,
            toBlock,
            fromBlock,
            keys: [],
            topics: [
                winkTokenInterface.getEventTopic('Transfer'),
                await getRebaserTopic()
            ],
            chain,
        })
    ).output
    
    const rebaseAmounts = rebases.reduce((acc, rebase) => acc.plus(rebase.data), new BigNumber(0))

    const annualRebased = rebaseAmounts.times(YEAR).div(REBASE_OBSERVATION_PERIOD)

    return annualRebased.times(100).div(lockedAmount).toNumber()
}

const ssrToApy = (ssr) => {
    return Math.round(100 * ((Number(ssr) / 10**27)**(YEAR) - 1) * 100) / 100;
}

const getLockUsdwApy = async () => {
    return ssrToApy((
        await sdk.api.abi.call({
            abi: LOCK_USDW_ABI.find((abi) => abi.name == 'lockAPY'),
            target: LOCK_USDW_ADDRESS,
            params: [0],
            chain,
        })
    ).output)
}

const getLockUsdwBalance = async () => {
    return (
        await sdk.api.abi.call({
            abi: 'erc20:balanceOf',
            target: USDW_TOKEN_ADDRESS,
            params: [LOCK_USDW_ADDRESS],
            chain,
        })
    ).output
}

const getSusdwApy = async () => {
    return ssrToApy((
        await sdk.api.abi.call({
            abi: S_USDW_ABI.find((abi) => abi.name == 'ssr'),
            target: S_USDW_ADDRESS,
            chain,
        })
    ).output)
}

const getSusdwBalance = async () => {
    return (
        await sdk.api.abi.call({
            abi: 'erc20:balanceOf',
            target: USDW_TOKEN_ADDRESS,
            params: [S_USDW_ADDRESS],
            chain,
        })
    ).output
}

const poolsFunction = async () => {

    const prices = await getPrices(chain, [WINK_TOKEN_ADDRESS, USDW_TOKEN_ADDRESS]);

    const usdwData = prices[`${chain}:${USDW_TOKEN_ADDRESS.toLowerCase()}`];
    const winkData = prices[`${chain}:${WINK_TOKEN_ADDRESS.toLowerCase()}`];

    const currentBlock = await sdk.api.util.getLatestBlock(chain);
    const toBlock = currentBlock.number;
    const pastTimestamp = currentBlock.timestamp - REBASE_OBSERVATION_PERIOD;
    const [fromBlock] = await utils.getBlocksByTime([pastTimestamp], chain);

    const lockWinkBalance = await getLockWinkBalance()
    const lockUsdwBalance = await getLockUsdwBalance()
    const susdwBalance = await getSusdwBalance()

    return [{
        pool: LOCK_WINK_ADDRESS,
        chain: utils.formatChain(chain),
        project: 'wink',
        symbol: 'LockWINK',
        tvlUsd: new BigNumber(lockWinkBalance).times(winkData?.price).div(1e18).toNumber(),
        apyReward: await getLockWinkApy(fromBlock, toBlock, lockWinkBalance),
        rewardTokens: [WINK_TOKEN_ADDRESS],
        poolMeta: '3 to 24 months lock'
    }, {
        pool: LOCK_USDW_ADDRESS,
        chain: utils.formatChain(chain),
        project: 'wink',
        symbol: 'LockUSDW',
        tvlUsd: new BigNumber(lockUsdwBalance).times(usdwData?.price).div(1e18).toNumber(),
        apyReward: await getLockUsdwApy(),
        rewardTokens: [USDW_TOKEN_ADDRESS],
        poolMeta: '3 to 24 months lock'
    }, {
        pool: S_USDW_ADDRESS,
        chain: utils.formatChain(chain),
        project: 'wink',
        symbol: 'sUSDW',
        tvlUsd: new BigNumber(susdwBalance).times(usdwData?.price).div(1e18).toNumber(),
        apyReward: await getSusdwApy(),
        rewardTokens: [USDW_TOKEN_ADDRESS],
        poolMeta: 'Liquid staking'
    }]
};

module.exports = {
    timetravel: false,
    apy: poolsFunction, // Main function, returns pools
    url: 'https://wink.finance/', // Link to page with pools (Only required if you do not provide url's for each pool)
};
