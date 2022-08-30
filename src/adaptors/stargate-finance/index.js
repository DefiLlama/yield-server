const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const utils = require('../utils');
const abi = require("./abis.json");

const CONFIG = {
    ethereum: {
        LP_STAKING: '0xB0D502E938ed5f4df2E681fE6E419ff29631d62b',
        STG_TOKEN: '0xaf5191b0de278c7286d6c7cc6ab6bb8a73ba2cd6',
        ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
    },
    bsc: {
        LP_STAKING: '0x3052A0F6ab15b4AE1df39962d5DdEFacA86DaB47',
        STG_TOKEN: '0xB0D502E938ed5f4df2E681fE6E419ff29631d62b',
    },
    avax: {
        LP_STAKING: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
        STG_TOKEN: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    },
    polygon: {
        LP_STAKING: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
        STG_TOKEN: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    },
    arbitrum: {
        LP_STAKING: '0xeA8DfEE1898a7e0a59f7527F076106d7e44c2176',
        ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
        STG_TOKEN: '0x6694340fc020c5e6b96567843da2df01b2ce1eb6',
    },
    optimism: {
        LP_STAKING: '0x4DeA9e918c6289a52cd469cAC652727B7b412Cd2',
        ETHER_TOKEN: '0x0000000000000000000000000000000000000000',
        OP_TOKEN: '0x4200000000000000000000000000000000000042',
    },
    fantom: {
        LP_STAKING: '0x224D8Fd7aB6AD4c6eb4611Ce56EF35Dec2277F03',
        STG_TOKEN: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    },
};



const pools = async (poolIndex, chain, lpStaking) => {

    // get pool lp token address
    const poolInfo = (await sdk.api.abi.call({ abi: abi.poolInfo, target: lpStaking, chain: chain, params: poolIndex })).output;

    // get pool lp token addr
    const lpToken = poolInfo.lpToken;

    // get pool lp token symbol
    // symbol like(S*USDC)
    const lpTokenSymbol = (await sdk.api.abi.call({ abi: abi.symbol, target: lpToken, chain: chain })).output;

    // get pool underlying token
    const underlyingLpToken = (await sdk.api.abi.call({ abi: abi.token, target: lpToken, chain: chain })).output;

    // get pool lp token decimals 
    const lpTokenDecimals = (await sdk.api.abi.call({ abi: abi.decimals, target: lpToken, chain: chain })).output;

    // pool points for rewards
    const allocPoint = await poolInfo.allocPoint;

    // total points of all pools per chain
    const totalAllocPoint = (await sdk.api.abi.call({ abi: abi.totalAllocPoint, target: lpStaking, chain: chain })).output;

    let rewardPerBlock;
    // reward (STG) per block
    if (chain !== 'optimism') {
        const STGPerBlock = (await sdk.api.abi.call({ abi: abi.stargatePerBlock, target: lpStaking, chain: chain })).output;
        rewardPerBlock = STGPerBlock;
    }
    // reward (OP) per block
    if (chain == 'optimism') {
        const eTokenPerBlock = (await sdk.api.abi.call({ abi: abi.eTokenPerSecond, target: lpStaking, chain: chain })).output;
        rewardPerBlock = eTokenPerBlock;
    }

    // coin amount in staking pool in usd
    const reserve = (await sdk.api.abi.call({ abi: abi.lpBalances, target: lpStaking, chain: chain, params: [poolIndex] })).output / (1 * 10 ** lpTokenDecimals);

    return {
        lpToken,
        lpTokenSymbol,
        underlyingLpToken,
        allocPoint,
        totalAllocPoint,
        rewardPerBlock,
        reserve,
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

    const price = (await getPrices(chain, [token.toLowerCase()]))[token.toLowerCase()];
    const reserveUSD = reserve * price;

    return reserveUSD;
}


function calcApy(chain, allocPoint, totalAllocPoint, reward, rewardPrice, reserve) {
    // pool rewards per year in usd
    // blocks per year * reward * wieght * price

    // BLOCK_TIME is number of seconds per 1 block settled
    // get avg block time directly from provider?
    let BLOCK_TIME = 13.5;
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


const getApy = async (chain, lpStaking) => {

    let poolsApy = [];
    const poolLength = parseInt((await sdk.api.abi.call({ abi: abi.poolLength, target: lpStaking, chain })).output);

    let rewardToken = CONFIG[chain].STG_TOKEN;
    if (chain == 'optimism') {
        rewardToken = CONFIG[chain].OP_TOKEN;
    }
    const rewardPrice = (await getPrices(chain, [rewardToken.toLowerCase()]))[rewardToken.toLowerCase()];

    for (i = 0; i < poolLength; i++) {
        const pool = await pools(i, chain, lpStaking);
        const reserveUSD = await tvl(chain, pool.lpTokenSymbol, pool.underlyingLpToken, pool.reserve);
        const apy = calcApy(chain, pool.allocPoint, pool.totalAllocPoint, pool.rewardPerBlock, rewardPrice, reserveUSD);

        poolsApy.push({
            pool: pool.lpToken,
            chain: chain,
            project: 'stargate',
            symbol: `${pool.lpTokenSymbol}`,
            tvlUsd: reserveUSD,
            apyReward: apy,
            underlyingTokens: [`${pool.underlyingLpToken}`],
            rewardTokens: [rewardToken],
        });
    }

    return poolsApy;
}

const main = async () => {

    let poolData = [];

    const eth = await getApy('ethereum', CONFIG.ethereum.LP_STAKING);
    const bsc = await getApy('bsc', CONFIG.bsc.LP_STAKING);
    const avax = await getApy('avax', CONFIG.avax.LP_STAKING);
    const polygon = await getApy('polygon', CONFIG.polygon.LP_STAKING);
    const arbi = await getApy('arbitrum', CONFIG.arbitrum.LP_STAKING);
    const op = await getApy('optimism', CONFIG.optimism.LP_STAKING);
    const fantom = await getApy('fantom', CONFIG.fantom.LP_STAKING);

    poolData.push(eth, bsc, avax, polygon, arbi, op, fantom);
    const exportData = poolData.flat().filter((p) => utils.keepFinite(p));
    console.log(exportData);
    return exportData;
}

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://stargate.finance/farm',
};
