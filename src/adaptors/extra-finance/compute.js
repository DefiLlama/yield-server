const { request } = require('graphql-request');
const superagent = require('superagent');
const BigNumber = require("bignumber.js");
const utils = require('../utils');
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
  if (!pool.rewards?.length) {
    return {
      rewardTokens: [],
    }
  }
  const rewardApys = pool.rewards.map(rewardItem => {
    const rewardTokenInfo = getTokenInfo(chain, rewardItem.rewardToken, prices)
    const rewardAmount = toDecimals(new BigNumber(rewardItem.totalRewards || '0'), rewardTokenInfo?.decimals)
    const rewardValue = rewardAmount * rewardTokenInfo?.price

    const yearTimes = (365 * 24 * 3600 * 1000) / rewardItem.rewardDuration

    const yearlyValue = yearTimes * rewardValue

    const rewardApr = yearlyValue / value
    const rewardApy = utils.aprToApy(rewardApr * 100)
    return rewardApy
  })

  return {
    rewardTokens: pool.rewards.map(item => item.rewardToken),
    rewardApy: rewardApys.reduce((cur, item) => cur + item, 0)
  }
}

exports.formatLendingPoolwithRewards = function(lendingPools, rewardsList) {
  return lendingPools.map((i) => {
    const targetRewards = rewardsList.filter(rewardsItem => i.stakingAddress?.toLowerCase() === rewardsItem.stakingAddress?.toLowerCase())
    if (targetRewards.length) {
      const rewards = targetRewards.map((rewardItem) => {
        return {
          rewardToken: rewardItem.rewardsToken,
          totalRewards: rewardItem.total,
          rewardDuration: Number(rewardItem.end) * 1000 - Number(rewardItem.start) * 1000,
          isRewardActive: Date.now() <= Number(rewardItem.end) * 1000 && Date.now() >= Number(rewardItem.start) * 1000,
        }
      }).filter(rewardItem => rewardItem.isRewardActive);

      return {
        ...i,
        rewards,
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

  for(let index = 0; index < vaults.length; index++) {
    const item = vaults[index]
    const {
      pair,
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

    const poolInfo = veloPoolsInfo.find(veloPool => veloPool.lp.toLowerCase() === pair.toLowerCase() &&
      veloPool.token1.toLowerCase() === token1.toLowerCase() &&
      veloPool.token0.toLowerCase() === token0.toLowerCase()
    )
    if (!poolInfo) {
      continue
    }
    const {
      reserve0,
      reserve1,
      liquidity,
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
      tvlUsd: toDecimals(totalLp) / toDecimals(liquidity) * totalPoolTvlUsd,
      baseApy: utils.aprToApy(baseApr),
      // leveragedApy,
    })
  }
  return parsedPoolsInfo
}
