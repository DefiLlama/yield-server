const sdk = require('@defillama/sdk');
const { getPoolInfos } = require('./abi.json')
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const helper = "0xEd950eB5acAD4CD63784618437bAF28fA2eE36Ab"
const jellyUsdcLP = "0x64C2F792038f1FB55da1A9a22749971eAC94463E"
const sweetPool = '0xF897C014a57298DA3453f474312079cC6cB140c0'
const royalPool = '0xcC43331067234a0014d298b5226A1c22cb0ac66a'
const pools = [sweetPool, royalPool]
const rewardTokenDecimals = 1e18;
const usdcDecimals = 1e6;
const lpTokenDecimals = 1e18;
const BLOCKS_PER_DAY = 4 * 60 * 24;
const BLOCKS_PER_YEAR = BLOCKS_PER_DAY * 365;

const getPools = async () => {
    const poolInfos = Object.values(
      (
        await sdk.api.abi.call({
          target: helper,
          abi: getPoolInfos,
          params: [pools],
        })
      ).output
    );

    return Promise.all(
      [...Array(Number(poolInfos.length)).keys()].map(async (i) => {
        const poolInfo = poolInfos[i];
        const rewards = Object.values(poolInfo.rewards);
        const rewardPrices = [];
        const rewardBlocks = [];
        rewards.forEach((rewardInfo) => {
          const rewardTokenPrice = rewardInfo.rewardTokenPrice / usdcDecimals;
          const rewardsPerBlock =
            rewardInfo.rewardsPerBlock / rewardTokenDecimals;
          rewardPrices.push(rewardTokenPrice);
          rewardBlocks.push(rewardsPerBlock);
        });

        const lpStaked = poolInfo.stakedTokenTotal / lpTokenDecimals;
        const lpTokenPrice = poolInfo.stakingTokenPrice / lpTokenDecimals;
        const tvl = lpStaked * lpTokenPrice;
        const token0 = poolInfo.token0;
        const token1 = poolInfo.token1;
        const poolId = poolInfo.poolId;

        const documents = Object.values(poolInfo.documents)
        const poolName = documents.find(doc => doc.name === 'poolName')?.data

        const apy = await calcApr(rewardPrices, rewardBlocks, tvl);
        return {
            tvl,
            apy,
            symbol: `${token0.symbol}-${token1.symbol}(${poolName})`,
            poolId
          }
      })
    );
} 

const calcApr = async (rewardTokenPrices, tokensPerBlock, tvl) => {
  let totalRewardsPerYear = new BigNumber(0);

  for (let i = 0; i < rewardTokenPrices.length; i++) {
    const rewardTokenPrice = rewardTokenPrices[i];
    const tokenPerBlock = tokensPerBlock[i];
    const rewardsPerYear = new BigNumber(rewardTokenPrice)
      .times(tokenPerBlock)
      .times(BLOCKS_PER_YEAR);

    totalRewardsPerYear = totalRewardsPerYear.plus(rewardsPerYear);
  }

  const apr = totalRewardsPerYear.div(tvl).times(100);
  return apr.isNaN() || !apr.isFinite() ? 0 : apr.toNumber();
};

const buildPool = (entry) => {
  const newObj = {
    pool: entry.poolId,
    chain: 'ethereum',
    project: 'jelly',
    symbol: utils.formatSymbol(entry.symbol),
    tvlUsd: parseInt(entry.tvl, 10),
    apy: parseFloat(entry.apy),
  };
  return newObj;
};

async function main() {
    const pools = await getPools()
    const data = pools.map((pool) => buildPool(pool));
    return data;
}

module.exports = {
    timetravel: false,
    apy: main,
};
  