const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const utils = require('../utils');
const abi = require("./abis.json");

//optimism uses (OP) token for rewards all else use (STG) token
const CONFIG = {
    ethereum: {
        LP_STAKING: '0xB0D502E938ed5f4df2E681fE6E419ff29631d62b',
        REWARD_TOKEN: '0xaf5191b0de278c7286d6c7cc6ab6bb8a73ba2cd6',
        ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
        LLAMA_NAME: 'Ethereum',
    },
    bsc: {
        LP_STAKING: '0x3052A0F6ab15b4AE1df39962d5DdEFacA86DaB47',
        REWARD_TOKEN: '0xB0D502E938ed5f4df2E681fE6E419ff29631d62b',
        LLAMA_NAME: 'Binance',
    },
    avax: {
        LP_STAKING: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
        REWARD_TOKEN: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
        LLAMA_NAME: 'Avalanche',
    },
    polygon: {
        LP_STAKING: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
        REWARD_TOKEN: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
        LLAMA_NAME: 'Polygon',
    },
    arbitrum: {
        LP_STAKING: '0xeA8DfEE1898a7e0a59f7527F076106d7e44c2176',
        ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
        REWARD_TOKEN: '0x6694340fc020c5e6b96567843da2df01b2ce1eb6',
        LLAMA_NAME: 'Arbitrum',
    },
    optimism: {
        LP_STAKING: '0x4DeA9e918c6289a52cd469cAC652727B7b412Cd2',
        ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
        REWARD_TOKEN: '0x4200000000000000000000000000000000000042',
        LLAMA_NAME: 'Optimism',
    },
    fantom: {
        LP_STAKING: '0x224D8Fd7aB6AD4c6eb4611Ce56EF35Dec2277F03',
        REWARD_TOKEN: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
        LLAMA_NAME: 'Fantom',
    },
};


const pools = async (poolIndex, chain) => {
    // info for tvl / apy calculations
    const poolInfo = (await sdk.api.abi.call({ abi: abi.poolInfo, target: CONFIG[chain].LP_STAKING, chain: chain, params: poolIndex })).output;
    const lpToken = poolInfo.lpToken;
    const lpTokenSymbol = (await sdk.api.abi.call({ abi: abi.symbol, target: lpToken, chain: chain })).output;
    const underlyingLpToken = (await sdk.api.abi.call({ abi: abi.token, target: lpToken, chain: chain })).output;
    const lpTokenDecimals = (await sdk.api.abi.call({ abi: abi.decimals, target: lpToken, chain: chain })).output;
    const allocPoint = await poolInfo.allocPoint;
    const totalAllocPoint = (await sdk.api.abi.call({ abi: abi.totalAllocPoint, target: CONFIG[chain].LP_STAKING, chain: chain })).output;
    const reserve = (await sdk.api.abi.call({ abi: abi.lpBalances, target: CONFIG[chain].LP_STAKING, chain: chain, params: [poolIndex] })).output / (1 * 10 ** lpTokenDecimals);

    let rewardPerBlock;
    // reward (STG) per block
    if (chain !== 'optimism') {
        const STGPerBlock = (await sdk.api.abi.call({ abi: abi.stargatePerBlock, target: CONFIG[chain].LP_STAKING, chain: chain })).output;
        rewardPerBlock = STGPerBlock;
    }
    // reward (OP) per block
    if (chain == 'optimism') {
        const eTokenPerBlock = (await sdk.api.abi.call({ abi: abi.eTokenPerSecond, target: CONFIG[chain].LP_STAKING, chain: chain })).output;
        rewardPerBlock = eTokenPerBlock;
    }

    return {
        lpToken,
        lpTokenSymbol,
        underlyingLpToken,
        allocPoint,
        totalAllocPoint,
        reserve,
        rewardPerBlock,
    };
}


const getPrices = async (chain, addresses) => {

    const prices = (
        await superagent.post('https://coins.llama.fi/prices').send({
            coins: addresses.map((address) => `${chain}:${address}`),
        })
    ).body.coins;

    const pricesObj = Object.entries(prices).reduce(
        (acc, [address, price]) => ({
            ...acc,
            [address.split(':')[1].toLowerCase()]: price.price,
        }),
        {}
    );

    return pricesObj;
};


const tvl = async (chain, symbol, underlyingLpToken, reserve) => {
    // total number of coins in pool * coin price
    let token = underlyingLpToken;
    if (symbol === 'S*SGETH') {
        token = CONFIG[chain].ETHER_TOKEN;
    }
    const price = (await getPrices(chain, [token]))[token.toLowerCase()];
    const reserveUSD = reserve * price;

    return reserveUSD;
}


function calcApy(chain, allocPoint, totalAllocPoint, reward, rewardPrice, reserve) {
    // pool rewards per year in usd
    // blocks per year * reward * wieght * price

    // BLOCK_TIME is number of seconds for 1 block to settle
    let BLOCK_TIME = 12;
    if (chain == 'fantom') {
        BLOCK_TIME = 1;
    }
    if (chain == 'optimism') {
        BLOCK_TIME = 1;
    }
    if (chain == 'polygon') {
        BLOCK_TIME = 2.11;
    }
    if (chain == 'avax') {
        BLOCK_TIME = 2.03;
    }
    if (chain == 'bsc') {
        BLOCK_TIME = 3;
    }
    const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
    const BLOCKS_PER_YEAR = SECONDS_PER_YEAR / BLOCK_TIME;

    const weight = allocPoint / totalAllocPoint;
    const rewardPerBlock = reward * weight;

    const rewardPerYear = rewardPerBlock / 1e18 * BLOCKS_PER_YEAR;

    const rewardUSD = rewardPerYear * rewardPrice;
    const apr = rewardUSD / reserve * 100;

    return apr;

}


const getApy = async (chain) => {

    let poolsApy = [];

    const poolLength = parseInt((await sdk.api.abi.call({ abi: abi.poolLength, target: CONFIG[chain].LP_STAKING, chain })).output);
    const rewardPrice = (await getPrices(chain, [CONFIG[chain].REWARD_TOKEN]))[(CONFIG[chain].REWARD_TOKEN).toLowerCase()];

    for (index = 0; index < poolLength; index++) {
        const pool = await pools(index, chain);
        const reserveUSD = await tvl(chain, pool.lpTokenSymbol, pool.underlyingLpToken, pool.reserve);
        const apy = calcApy(chain, pool.allocPoint, pool.totalAllocPoint, pool.rewardPerBlock, rewardPrice, reserveUSD);

        poolsApy.push({
            pool: `${pool.lpToken}-${CONFIG[chain].LLAMA_NAME}`.toLowerCase(),
            chain: CONFIG[chain].LLAMA_NAME,
            project: 'stargate',
            symbol: `${pool.lpTokenSymbol}`,
            tvlUsd: reserveUSD,
            apyReward: apy,
            underlyingTokens: [`${pool.underlyingLpToken}`],
            rewardTokens: [`${CONFIG[chain].REWARD_TOKEN}`],
        });
    }

    return poolsApy;
}


const main = async () => {

    let poolsData = [];

    const eth = await getApy('ethereum', CONFIG.ethereum.LP_STAKING);
    const bsc = await getApy('bsc', CONFIG.bsc.LP_STAKING);
    const avax = await getApy('avax', CONFIG.avax.LP_STAKING);
    const polygon = await getApy(('polygon'), CONFIG.polygon.LP_STAKING);
    const arbi = await getApy('arbitrum', CONFIG.arbitrum.LP_STAKING);
    const op = await getApy('optimism', CONFIG.optimism.LP_STAKING);
    const fantom = await getApy('fantom', CONFIG.fantom.LP_STAKING);

    poolsData.push(eth, bsc, avax, polygon, arbi, op, fantom);
    const exportData = poolsData.flat().filter((p) => utils.keepFinite(p));

    return exportData;
}

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://stargate.finance/farm',
};
