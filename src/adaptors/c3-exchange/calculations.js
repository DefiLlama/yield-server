const BigNumber = require('bignumber.js')

const RATIO_ONE = 1_000n
const RATE_ONE = 1_000_000_000_000n
const PRICE_SCALE_FACTOR = 1_000_000_000_000n
const SECONDS_PER_YEAR = 60 * 60 * 24 * 365

// Calculates an exponential using bigints
function ratioExp(base, exponent) {
  let result = RATE_ONE
  let power = BigInt(base)
  while (exponent > 0n) {
      if (exponent & 1n)
          result = result * power / RATE_ONE
      power = power * power / RATE_ONE
      exponent = exponent >> 1n
  }
  return result
}

// Calculates the utilization rate of a pool
function calculateUtilizationRate(borrowed, liquidity) {
  return liquidity === 0n ? 0n : borrowed * RATE_ONE / liquidity
}

// Calculates the interest rate of the pool
function calculateInterestRate(poolRates, borrowed, liquidity) {
  const { optimalUtilization, minRate, maxRate, optRate } = poolRates
  const optimalUtilizationRate = optimalUtilization * RATE_ONE / RATIO_ONE
  const utilizationRate = calculateUtilizationRate(borrowed, liquidity)
  const interestRate = utilizationRate < optimalUtilizationRate ?
    minRate + utilizationRate * (optRate - minRate) / optimalUtilizationRate :
    optRate + (utilizationRate - optimalUtilizationRate) * (maxRate - optRate) / (RATE_ONE - optimalUtilizationRate)
  
  return interestRate
}

// Calculate the new pool data given the old pool data and a relative time delta
function calculatePoolRates(poolData, relativeTime) {
  const { borrowed, liquidity, borrowIndex, lendIndex, lastUpdateTime, poolRates } = poolData

  // Calculate accrued interest
  const deltaTime = relativeTime - lastUpdateTime
  const interestRateInSeconds = calculateInterestRate(poolRates, borrowed, liquidity)
  const compoundingRate = ratioExp(RATE_ONE + interestRateInSeconds, deltaTime)
  const accruedInterest = (compoundingRate - RATE_ONE) * borrowed / RATE_ONE
  
  // Calculate new pool data
  const newBorrowed = borrowed + accruedInterest
  const newLiquidity = liquidity + accruedInterest
  const newBorrowIndex = borrowed === 0n ? RATE_ONE : borrowIndex * newBorrowed / borrowed
  const newLendIndex = liquidity === 0n ? RATE_ONE : lendIndex * newLiquidity / liquidity
  
  return { newBorrowed, newLiquidity, newBorrowIndex, newLendIndex }
}

// Annualizes a per-second interest raet into an APR
function annualizedInterestRate(interestRateInSeconds) {
  const rateInBig = ratioExp(RATE_ONE + interestRateInSeconds, BigInt(SECONDS_PER_YEAR)) - RATE_ONE
  const annualizedRate = new BigNumber(rateInBig.toString()).dividedBy(new BigNumber(RATE_ONE.toString())).toNumber()
  return annualizedRate
}

// Calculates borrow and lend using on-chain data and then applying time based
// interest offset to reflect contract activity more accurately. This follows the
// contract logic for interest calculation.
function calculateBorrowAndLendAPR(initTimestamp, poolData) {
  const currentTimestamp = Math.floor(Date.now() / 1_000)
  const relativeTime = BigInt(currentTimestamp - initTimestamp)
  const poolRates = calculatePoolRates(poolData, relativeTime)
  const utilizationRate = calculateUtilizationRate(poolRates.newBorrowed, poolRates.newLiquidity)
  const borrowRateInSeconds = calculateInterestRate(poolData.poolRates, poolRates.newBorrowed, poolRates.newLiquidity)
  const lendRateInSeconds = borrowRateInSeconds * utilizationRate / RATE_ONE
  const borrowApr = annualizedInterestRate(borrowRateInSeconds)
  const lendApr = annualizedInterestRate(lendRateInSeconds)
  return { borrowApr, lendApr }
}

// Calculates the TVL given price and pool state
function calculateTVL(price, borrowed, liquidity) {
  const totalBorrowUsd = new BigNumber(price).times(new BigNumber(borrowed)).dividedBy(new BigNumber(PRICE_SCALE_FACTOR)).toNumber()
  const totalSupplyUsd = new BigNumber(price).times(new BigNumber(liquidity)).dividedBy(new BigNumber(PRICE_SCALE_FACTOR)).toNumber()
  const tvlUsd = totalSupplyUsd - totalBorrowUsd

  return {
    tvlUsd,
    totalBorrowUsd,
    totalSupplyUsd,
  }
}

module.exports = {
  calculateBorrowAndLendAPR,
  calculateTVL,
}
