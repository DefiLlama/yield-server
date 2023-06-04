const { request } = require('graphql-request');
const superagent = require('superagent');
const BigNumber = require("bignumber.js");
const utils = require('../utils');

const subgraphUrls = {
  optimism: `https://api.thegraph.com/subgraphs/name/extrafi/extrasubgraph`,
};

function toDecimals(bn, decimals = 18) {
  return new BigNumber(bn).div(new BigNumber(`1e+${decimals}`)).toNumber()
}

function getLendPoolTvl(poolInfo, tokenInfo) {
  const { totalLiquidity, totalBorrows } = poolInfo
  const remainAmount = toDecimals(new BigNumber(totalLiquidity).minus(new BigNumber(totalBorrows)), poolInfo.decimals);
  return remainAmount * tokenInfo.price
}

function getLendPollApy(poolInfo) {
  const { borrowingRate, totalLiquidity, totalBorrows } = poolInfo
  const borrowingRateNum = toDecimals(borrowingRate)
  const utilizationRate = new BigNumber(totalBorrows).dividedBy(new BigNumber(totalLiquidity)).toNumber() || 0
  const apr = borrowingRateNum * utilizationRate
  return utils.aprToApy(apr * 100)
}

async function getPoolsData() {
  const project = 'extra'
  const chain = 'optimism';

  const pools = [];

  const lendingQuery = `{
    lendingReservePools {
      id
      reserveId
      underlyingTokenAddress
      totalLiquidity
      totalBorrows
      borrowingRate
    }
  }`;
  const lendingQueryResult = await request(subgraphUrls[chain], lendingQuery);

  const addresses = lendingQueryResult.lendingReservePools.map(item => item.underlyingTokenAddress)
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: chain
        ? addresses.map((address) => `${chain}:${address}`)
        : addresses,
    })
  ).body.coins;

  lendingQueryResult.lendingReservePools.forEach(poolInfo => {
    const coinKey = `${chain}:${poolInfo.underlyingTokenAddress}`;
    const tokenInfo = prices[coinKey]

    pools.push({
      pool: `${poolInfo.underlyingTokenAddress}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project,
      symbol: tokenInfo.symbol,
      underlyingTokens: [poolInfo.underlyingTokenAddress],
      poolMeta: `${tokenInfo.symbol} lending pool`,
      tvlUsd: getLendPoolTvl(poolInfo, tokenInfo),
      apyBase: getLendPollApy(poolInfo),
    })
  })

  return pools
}

module.exports = {
  apy: getPoolsData,
  url: 'https://app.extrafi.io',
};
