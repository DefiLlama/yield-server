const { request } = require('graphql-request');
const superagent = require('superagent');
const BigNumber = require('bignumber.js');
const { default: computeTVL } = require('@defillama/sdk/build/computeTVL');

const utils = require('../utils');
const { unwrapUniswapLPs } = require('../../helper/unwrapLPs');
const {
  getTokenInfo,
  getLendPoolTvl,
  getLendPoolApy,
  formatLendingPoolwithRewards,
  getLendPoolRewardInfo,
  getAllVeloPoolInfo,
} = require('./compute');

const project = 'extra-finance';

const chains = ['optimism', 'base']
const subgraphUrls = {
  optimism: `https://api.thegraph.com/subgraphs/name/extrafi/extrasubgraph`,
  base: `https://api.thegraph.com/subgraphs/name/extrafi/extrafionbase`,
};

async function getPoolsData() {
  const pools = [];

  const graphQuery = `{
    vaults {
      id
      vaultId
      blockNumber
      blockTimestamp
      pair
      token0
      token1
      stable
      paused
      frozen
      borrowingEnabled
      maxLeverage
      totalLp
      debtPositionId0
      debtPositionId1
    },
    lendingReservePools {
      id
      reserveId
      underlyingTokenAddress
      stakingAddress
      eTokenAddress
      totalLiquidity
      totalBorrows
      borrowingRate
    }
    latestRewardsSets {
      stakingAddress
      rewardsToken
      id
      end
      blockTimestamp
      blockNumber
      start
      total
      transactionHash
    }
  }`;

  async function getPoolsByChain(chain) {
    const queryResult = await request(subgraphUrls[chain], graphQuery);

    const filteredLendingPools = queryResult.lendingReservePools.filter(item => {
      return new BigNumber(item.totalLiquidity).gt(0);
    })
    const filteredFarmingPools = queryResult.vaults.filter(item => {
      return new BigNumber(item.totalLp).gt(0);
    })

    function getTokenAddresses() {
      const lendingTokenAddresses = filteredLendingPools.map(
        (item) => item.underlyingTokenAddress
      );
      const result = [...lendingTokenAddresses];
      // add reward token
      queryResult.latestRewardsSets.forEach(item => {
        if (!result.includes(item.rewardsToken)) {
          result.push(item.rewardsToken);
        }
      })
      queryResult.vaults.forEach((item) => {
        if (!result.includes(item.token0)) {
          result.push(item.token0);
        }
        if (!result.includes(item.token1)) {
          result.push(item.token1);
        }
      });
      return result;
    }
    const tokenAddresses = getTokenAddresses();

    const coins = chain
      ? tokenAddresses.map((address) => `${chain}:${address}`)
      : tokenAddresses;

    const prices = (
      await superagent.get(`https://coins.llama.fi/prices/current/${coins}`)
    ).body.coins;

    const parsedFarmPoolsInfo = await getAllVeloPoolInfo(
      filteredFarmingPools.filter((item) => !item.paused),
      chain,
      prices,
      queryResult.lendingReservePools
    );

    parsedFarmPoolsInfo.forEach(async (poolInfo) => {
      pools.push({
        pool: `${poolInfo.pair}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project,
        symbol: `${poolInfo.token0_symbol}-${poolInfo.token1_symbol}`,
        underlyingTokens: [poolInfo.token0, poolInfo.token1],
        poolMeta: `Leveraged Yield Farming`,
        tvlUsd: poolInfo.tvlUsd,
        apyBase: poolInfo.baseApy,
      });
    });

    const formattedLendingPools = formatLendingPoolwithRewards(filteredLendingPools, queryResult.latestRewardsSets || [])
    formattedLendingPools.forEach((poolInfo) => {
      const tokenInfo = getTokenInfo(chain, poolInfo.underlyingTokenAddress, prices);
      const rewardsInfo = getLendPoolRewardInfo(poolInfo, chain, prices)
      pools.push({
        pool: `${poolInfo.eTokenAddress}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project,
        symbol: tokenInfo?.symbol,
        underlyingTokens: [poolInfo.underlyingTokenAddress],
        poolMeta: `Lending Pool`,
        tvlUsd: getLendPoolTvl(poolInfo, tokenInfo),
        apyBase: getLendPoolApy(poolInfo),
        apyReward: rewardsInfo?.rewardApy || undefined,
        rewardTokens: rewardsInfo?.rewardTokens,
      });
    });
  }

  for (const chain of Object.keys(subgraphUrls)) {
    await getPoolsByChain(chain)
  }

  return pools.filter((p) => utils.keepFinite(p));
}

module.exports = {
  apy: getPoolsData,
  url: 'https://app.extrafi.io',
};
