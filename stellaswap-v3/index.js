const { request, gql } = require('graphql-request');
const BigNumber = require('bignumber.js');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { pulsar } = require('./clients');
const { queryPools, queryPrior } = require('./queries');
const { updateFarmsRewardsApr, updatePoolsApr } = require('./offchain-service');
const {
    getPreviousBlockNumber,
    getPositionsOfPool,
    getAmounts,
} = require('./utils');

const topLvl = async (chainString, timestamp, url) => {
    const balanceCalls = [];
    const prevBlockNumber = await getPreviousBlockNumber()

    let data = (await request(url, queryPools)).pools
    const dataPrior = (await request(url, queryPrior.replace('<PREV_BLOCK_NUMBER>', prevBlockNumber))).pools;

    for (const pool of data) {
        balanceCalls.push({
            target: pool.token0.id,
            params: pool.id,
        });
        balanceCalls.push({
            target: pool.token1.id,
            params: pool.id,
        });
    }

    const tokenBalances = await sdk.api.abi.multiCall({
        abi: 'erc20:balanceOf',
        calls: balanceCalls,
        chain: chainString,
        permitFailure: true,
    });

    data = data.map((p) => {
        const x = tokenBalances.output.filter((i) => i.input.params[0] === p.id);
        return {
            ...p,
            reserve0: (parseFloat(x.find((i) => i.input.target === p.token0.id)?.output || 0) / Math.pow(10, p.token0.decimals)),
            reserve1: (parseFloat(x.find((i) => i.input.target === p.token1.id)?.output || 0) / Math.pow(10, p.token1.decimals)),
        };
    });

    data = await utils.tvl(data, chainString);

    const poolsFees = {};
    const poolsCurrentTvl = {};

    for (const pool of data) {
        const currentFeesInToken0 = new BigNumber(pool.feesToken0).plus(new BigNumber(pool.feesToken1).times(new BigNumber(pool.token0Price)));
        const priorData = dataPrior.find(dp => dp.id === pool.id);
        const priorFeesInToken0 = priorData ? new BigNumber(priorData.feesToken0).plus(new BigNumber(priorData.feesToken1).times(new BigNumber(priorData.token0Price))) : new BigNumber(0);
        const feesIn24Hours = currentFeesInToken0.minus(priorFeesInToken0);

        poolsFees[pool.id] = feesIn24Hours;
        poolsCurrentTvl[pool.id] = new BigNumber(0);
        const positionsJson = await getPositionsOfPool(pool.id);
        for (const position of positionsJson) {
            const currentTick = new BigNumber(pool.tick);
            const { amount0, amount1 } = getAmounts(
                new BigNumber(position.liquidity),
                new BigNumber(position.tickLower.tickIdx),
                new BigNumber(position.tickUpper.tickIdx),
                currentTick,
            );
            const adjustedAmount0 = amount0 / Math.pow(10, position.token0.decimals);
            const adjustedAmount1 = amount1 / Math.pow(10, position.token1.decimals);
            poolsCurrentTvl[pool.id] += adjustedAmount0 + (adjustedAmount1 * parseFloat(pool.token0Price));
        }
    }

    const poolsFarmApr = await updateFarmsRewardsApr();
    const poolsAPRObj = await updatePoolsApr();

    const poolsAPR = {};
    const poolsRewardTokens = {}; // Add this to store reward tokens for each pool

    const poolsBaseAPR = poolsAPRObj;

    for (const pool of data) {
        const apr = poolsBaseAPR[pool.id] ? new BigNumber(poolsBaseAPR[pool.id]) : new BigNumber(0);
        poolsAPR[pool.id] = apr;

        const rewardTokens = apr.isNaN() || apr.eq(0) ? [] : [pool.token0.id, pool.token1.id];
        poolsRewardTokens[pool.id] = rewardTokens; // Store reward tokens for each pool
    }

    data = data.map((p) => {
        const tvl = p.poolDayData[0]?.tvlUSD || 0;
        if (tvl > 30000) {
            const baseAPR = poolsAPR[p.id] ? poolsAPR[p.id].toNumber() : 0;
            const rewardsAPR = poolsFarmApr.pools[p.id]?.apr.toNumber() || 0;
            const rewardTokens = poolsRewardTokens[p.id];

            return {
                pool: p.id,
                chain: utils.formatChain(chainString),
                project: 'stellaswap-v3',
                symbol: `${p.token0.symbol}-${p.token1.symbol}`,
                tvlUsd: parseFloat(tvl),
                apyBase: baseAPR,
                apyReward: rewardsAPR,
                rewardTokens: rewardTokens,
                underlyingTokens: [p.token0.id, p.token1.id],
                url: `https://app.stellaswap.com/pulsar/add/${p.token0.id}/${p.token1.id}`,
            };
        }
    }).filter(p => p);

    return data;
};

const main = async (timestamp = null) => {
    const data = await Promise.all([topLvl('moonbeam', timestamp, pulsar)]);
    return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://stellaswap.com/',
};
