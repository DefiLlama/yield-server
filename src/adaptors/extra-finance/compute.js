const { request } = require('graphql-request');
const superagent = require('superagent');
const BigNumber = require("bignumber.js");
const { default: computeTVL } = require('@defillama/sdk/build/computeTVL');
const utils = require('../utils');
const { unwrapUniswapLPs } = require('../../helper/unwrapLPs');
const { getAllVeloPools } = require('./contract')

function toDecimals(bn, decimals = 18) {
  return new BigNumber(bn.toString()).div(new BigNumber(`1e+${decimals}`)).toNumber()
}

function getTokenInfo(chain, address, prices) {
  const coinKey = `${chain}:${address.toLowerCase()}`;
  return prices[coinKey]|| {};
}

exports.getTokenInfo = getTokenInfo

exports.getLendPoolTvl = function(poolInfo, tokenInfo) {
  const { totalLiquidity, totalBorrows } = poolInfo
  const remainAmount = toDecimals(new BigNumber(totalLiquidity).minus(new BigNumber(totalBorrows)), tokenInfo.decimals);
  return remainAmount * tokenInfo?.price
}

exports.getLendPoolApy = function (poolInfo) {
  const { borrowingRate, totalLiquidity, totalBorrows } = poolInfo
  const borrowingRateNum = toDecimals(borrowingRate)
  const utilizationRate = new BigNumber(totalBorrows).dividedBy(new BigNumber(totalLiquidity)).toNumber() || 0
  const apr = borrowingRateNum * utilizationRate
  return utils.aprToApy(apr * 100)
}

exports.getLendPoolRewardInfo = function(pool, chain, prices) {
  const token = getTokenInfo(chain, pool.underlyingTokenAddress, prices)
  const amount = toDecimals(pool.totalLiquidity, token.decimals)
  const value = amount * token.price
  if (pool.isRewardActive) {
    const rewardTokenInfo = getTokenInfo(chain, pool.rewardToken, prices)
    const rewardAmount = toDecimals(new BigNumber(pool.totalRewards || '0'), rewardTokenInfo?.decimals)
    const rewardValue = rewardAmount * rewardTokenInfo?.price

    const yearTimes = (365 * 24 * 3600 * 1000) / pool.rewardDuration

    const yearlyValue = yearTimes * rewardValue

    const rewardApr = yearlyValue / value
    const rewardApy = utils.aprToApy(rewardApr * 100)
    // console.log('getLendPoolRewardInfo: >>', {yearlyValue, rewardTokenInfo, rewardApr, rewardApy, rewardAmount, rewardValue, value, pool})
    return {
      rewardApy,
      rewardTokens: [pool.rewardToken],
    }
  }
}

exports.formatLendingPoolwithRewards = function(lendingPools, rewardsList) {
  return lendingPools.map((i) => {
    const targetReward = rewardsList.find(rewardsItem => i.stakingAddress?.toLowerCase() === rewardsItem.stakingAddress?.toLowerCase())
    if (targetReward) {
      return {
        ...i,
        rewardToken: targetReward.rewardsToken,
        totalRewards: targetReward.total,
        rewardDuration: Number(targetReward.end) * 1000 - Number(targetReward.start) * 1000,
        isRewardActive:
          Date.now() <= Number(targetReward.end) * 1000 && Date.now() >= Number(targetReward.start) * 1000,
      }
    }
    return i
  })
}

exports.getAllVeloPoolInfo = async function(vaults, chain, prices, lendingPools) {
  const parsedPoolsInfo = []
  function getToken(address) {
    return getTokenInfo(chain, address, prices)
  }
  const veloPoolsInfo = await getAllVeloPools(chain)
  
  // get extra price
  const extraToken = {
    symbol: 'EXTRA',
    address: '0x2dAD3a13ef0C6366220f989157009e501e7938F8',
    decimals: 18,
  }
  const veloUsdcPair = veloPoolsInfo.find(veloPool => {
    const {
      reserve0,
      reserve1,
      token0,
      token1,
      total_supply,
      stable,
      symbol,
      emissions,
      emissions_token,
    } = veloPool
    const {
      decimals: token1_decimals,
      symbol: token1_symbol,
      price: token1price,
    } = getToken(token1)
    if (!stable && token0 === extraToken.address && token1_symbol?.toLowerCase() === 'usdc') {
      const coinKey = `${chain}:${token0.toLowerCase()}`;
      const poolToken0Amount = toDecimals(reserve0, extraToken.decimals)
      const poolToken1Amount = toDecimals(reserve1, token1_decimals)
      const price = poolToken0Amount > 0 ? poolToken1Amount / poolToken0Amount : 0
      prices[coinKey] = {
        ...extraToken,
        price,
      }
    }
  })

  for(let index = 0; index < vaults.length; index++) {
    const item = vaults[index]
    const {
      stable,
      token0,
      token1,
      maxLeverage,
      totalLp,
    } = item
    const {
      decimals: token0_decimals,
      symbol: token0_symbol,
      price: token0price,
    } = getToken(token0)
    const {
      decimals: token1_decimals,
      symbol: token1_symbol,
      price: token1price,
    } = getToken(token1)

    const poolInfo = veloPoolsInfo.find(veloPool => veloPool.stable === stable &&
      veloPool.token1.toLowerCase() === token1.toLowerCase() &&
      veloPool.token0.toLowerCase() === token0.toLowerCase()
    )
    if (!poolInfo) {
      continue
    }
    const {
      reserve0,
      reserve1,
      total_supply,
      symbol,
      emissions,
      emissions_token,
    } = poolInfo
    const {
      decimals: emissions_token_decimals,
      price: emissionsPrice,
    } = getToken(emissions_token)

    // const floorMaxLeverage = Math.floor(maxLeverage / 100)
    const reserve0usd = toDecimals(reserve0, token0_decimals) * token0price
    const reserve1usd = toDecimals(reserve1, token1_decimals) * token1price
    const totalPoolTvlUsd = reserve0usd + reserve1usd

    function getPoolBaseApr() {
      const yearlyEmissionAmount = 365 * 24 * 3600 * toDecimals(emissions, emissions_token_decimals)
      const yearlyEmissionValue = emissionsPrice * yearlyEmissionAmount
      const apr = yearlyEmissionValue / totalPoolTvlUsd * 100
      return apr
    }
    const baseApr = getPoolBaseApr()

    // function getBorrowApr() {
    //   const lendingPoolToken0 = lendingPools.find(item => item.underlyingTokenAddress.toLowerCase() === token0.toLowerCase())
    //   const lendingPoolToken1 = lendingPools.find(item => item.underlyingTokenAddress.toLowerCase() === token1.toLowerCase())
    //   const borrowApr = Math.min(toDecimals(lendingPoolToken0.borrowingRate), toDecimals(lendingPoolToken1.borrowingRate))
    //   return borrowApr
    // }

    // const leveragedApy = getFarmApy({
    //   leverage: floorMaxLeverage,
    //   baseApr,
    //   borrowApr: getBorrowApr() * 100,
    // })

    parsedPoolsInfo.push({
      ...item,
      symbol,
      token0_symbol,
      token1_symbol,
      reserve0usd,
      reserve1usd,
      tvlUsd: toDecimals(totalLp) / toDecimals(total_supply) * totalPoolTvlUsd,
      baseApy: utils.aprToApy(baseApr),
      // leveragedApy,
    })
  }
  return parsedPoolsInfo
}

// function getFarmApy({
//   equity0 = 1,
//   leverage = 1,
//   baseApr = 0,
//   borrowApr = 0,
// }) {
//   const position0 = equity0 * leverage
//   const position1 = position0 + position0 * utils.aprToApy(baseApr)
//   const debt0 = equity0 * (leverage - 1)
//   const debt1 = debt0 + debt0 * utils.aprToApy(borrowApr)
//   const equity1 = position1 - debt1

//   return equity1 / equity0 - 1
// }
