const BigNumber = require('bignumber.js')

const TRU_DECIMALS = 8
const YEAR_IN_DAYS = 365
const DAY_IN_SECONDS = 24 * 60 * 60

async function getPoolApyRewards(poolAddress: string, poolDecimals: number, truPrice: number, multifarm: any, distributor: any) {
  const poolStakes = new BigNumber(await multifarm.methods.stakes(poolAddress).call())
  const poolShare = new BigNumber(await multifarm.methods.getShare(poolAddress).call())
  const totalShares = new BigNumber(await multifarm.methods.shares().call())

  const duration = new BigNumber(await distributor.methods.duration().call())
  const totalAmount = new BigNumber(await distributor.methods.totalAmount().call())

  const divider = duration.multipliedBy(totalShares)
  const dailyRewards = totalAmount.multipliedBy(poolShare).multipliedBy(DAY_IN_SECONDS).div(divider)
  const yearlyRewards = dailyRewards.multipliedBy(YEAR_IN_DAYS)
  const yearlyRewardsInUsd = yearlyRewards.multipliedBy(truPrice)

  // rewards / poolStakes * 100%
  return yearlyRewardsInUsd.multipliedBy(10 ** (2 + poolDecimals - TRU_DECIMALS)).div(poolStakes).toNumber()
}

module.exports = {
  getPoolApyRewards
}
