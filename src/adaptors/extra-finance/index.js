const { request } = require('graphql-request');
const superagent = require('superagent');
const BigNumber = require("bignumber.js");
const { default: computeTVL } = require('@defillama/sdk/build/computeTVL');

const utils = require('../utils');
const { unwrapUniswapLPs } = require('../../helper/unwrapLPs');
const {
  getLendPoolTvl,
  getLendPoolApy,
  getAllVeloPoolInfo,
} = require('./compute');

const project = 'extra-finance'
const subgraphUrls = {
  optimism: `https://api.thegraph.com/subgraphs/name/extrafi/extrasubgraph`,
};

async function getPoolsData() {
  const chain = 'optimism';

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
      eTokenAddress
      totalLiquidity
      totalBorrows
      borrowingRate
    }
  }`;
  const queryResult = await request(subgraphUrls[chain], graphQuery);
  // console.log('queryResult :>> ', queryResult);

  function getTokenAddresses() {
    const lendingTokenAddresses = queryResult.lendingReservePools.map(item => item.underlyingTokenAddress)
    const result = [...lendingTokenAddresses]
    queryResult.vaults.forEach(item => {
      if (!result.includes(item.token0)) {
        result.push(token0)
      }
      if (!result.includes(item.token1)) {
        result.push(token1)
      }
    })
    return result
  }
  const tokenAddresses = getTokenAddresses()

  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: chain
        ? tokenAddresses.map((address) => `${chain}:${address}`)
        : tokenAddresses,
    })
  ).body.coins;

  function getTokenInfo(address) {
    const coinKey = `${chain}:${address.toLowerCase()}`;
    return prices[coinKey]
  }

  queryResult.lendingReservePools.forEach(poolInfo => {
    const tokenInfo = getTokenInfo(poolInfo.underlyingTokenAddress)

    pools.push({
      pool: `${poolInfo.eTokenAddress}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project,
      symbol: tokenInfo.symbol,
      underlyingTokens: [poolInfo.underlyingTokenAddress],
      poolMeta: `Lending Pool`,
      tvlUsd: getLendPoolTvl(poolInfo, tokenInfo),
      apyBase: getLendPoolApy(poolInfo),
    })
  })

  const parsedFarmPoolsInfo = await getAllVeloPoolInfo(
    queryResult.vaults.filter(item => !item.paused),
    chain, prices, queryResult.lendingReservePools
  )

  parsedFarmPoolsInfo.forEach(async (poolInfo) => {
    pools.push({
      pool: `${poolInfo.pair}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project,
      symbol: `${poolInfo.token0_symbol}-${poolInfo.token1_symbol}`,
      underlyingTokens: [poolInfo.token0, poolInfo.token1],
      poolMeta: `Leveraged Yield Farming`,
      tvlUsd: poolInfo.tvlUsd,
      apyBase: poolInfo.leveragedApy,
    })
  })

  return pools
}

module.exports = {
  apy: getPoolsData,
  url: 'https://app.extrafi.io',
};
