const { request } = require('graphql-request');
const superagent = require('superagent');
const BigNumber = require("bignumber.js");
const { default: computeTVL } = require('@defillama/sdk/build/computeTVL');
const utils = require('../utils');
const { unwrapUniswapLPs } = require('../../helper/unwrapLPs');
const { getVeloPoolInfo } = require('./contract')

function toDecimals(bn, decimals = 18) {
  return new BigNumber(bn.toString()).div(new BigNumber(`1e+${decimals}`)).toNumber()
}

exports.getLendPoolTvl = function(poolInfo, tokenInfo) {
  const { totalLiquidity, totalBorrows } = poolInfo
  const remainAmount = toDecimals(new BigNumber(totalLiquidity).minus(new BigNumber(totalBorrows)), tokenInfo.decimals);
  return remainAmount * tokenInfo.price
}

exports.getLendPoolApy = function (poolInfo) {
  const { borrowingRate, totalLiquidity, totalBorrows } = poolInfo
  const borrowingRateNum = toDecimals(borrowingRate)
  const utilizationRate = new BigNumber(totalBorrows).dividedBy(new BigNumber(totalLiquidity)).toNumber() || 0
  const apr = borrowingRateNum * utilizationRate
  return utils.aprToApy(apr * 100)
}

exports.getAllVeloPoolInfo = async function(vaults, chain, prices, lendingPools) {
  const parsedPoolsInfo = []
  function getTokenInfo(address) {
    const coinKey = `${chain}:${address.toLowerCase()}`;
    return prices[coinKey]
  }
  for(let index = 0; index < vaults.length; index++) {
    const item = vaults[index]
    const {
      token0,
      token1,
      maxLeverage,
      totalLp,
    } = item
    const poolInfo = await getVeloPoolInfo(item.pair)
    const {
      reserve0,
      reserve1,
      total_supply,
      stable,
      symbol,
      emissions,
      emissions_token,
      emissions_token_decimals,
      token0_decimals,
      token1_decimals,
      token0_symbol,
      token1_symbol,
    } = poolInfo
    const floorMaxLeverage = Math.floor(maxLeverage / 100)
    const reserve0usd = toDecimals(reserve0, token0_decimals) * getTokenInfo(token0).price
    const reserve1usd = toDecimals(reserve1, token1_decimals) * getTokenInfo(token1).price
    const totalPoolTvlUsd = reserve0usd + reserve1usd

    function getPoolBaseApr() {
      const emissionsPrice = getTokenInfo(emissions_token).price;
      const yearlyEmissionAmount = 365 * 24 * 3600 * toDecimals(emissions, emissions_token_decimals)
      const yearlyEmissionValue = emissionsPrice * yearlyEmissionAmount
      const apr = yearlyEmissionValue / totalPoolTvlUsd * 100
      return apr
    }

    const baseApr = getPoolBaseApr()

    parsedPoolsInfo.push({
      ...item,
      symbol,
      token0_symbol,
      token1_symbol,
      reserve0usd,
      reserve1usd,
      tvlUsd: toDecimals(totalLp) / toDecimals(total_supply) * totalPoolTvlUsd,
      baseApy: utils.aprToApy(baseApr),
    })
  }
  return parsedPoolsInfo
}
