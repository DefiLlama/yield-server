const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const abiInterestRateModel = require('./abi/abiInterestRateModel.json');
const abiLendingPool = require('./abi/abiLendingPool.json');

const {ADDRESSES, CHAIN, SECONDS_PER_YEAR} = require('./Constants');

/**
 * 
 * Calculates the supply APY for USDC lending
 */
const getSupplyAPY = async (availableLiquidity, totalBorrows) => {
  try {
    // Get raw borrow rate from interest rate model
    const rawBorrowRateResult = await sdk.api.abi.call({
      target: ADDRESSES.INTEREST_RATE_MODEL,
      abi: abiInterestRateModel.find((m) => m.name === 'getBorrowRate'),
      params: [availableLiquidity, totalBorrows],
      chain: CHAIN,
    });

    const rawBorrowRate = BigInt(rawBorrowRateResult.output);

    // Get reserve factor and gloop stakers yield factor
    const [reserveFactorResult, gloopStakersYieldFactorResult] =
      await Promise.all([
        sdk.api.abi.call({
          target: ADDRESSES.LENDING_POOL,
          abi: abiLendingPool.find((m) => m.name === 'reserveFactor'),
          chain: CHAIN,
        }),
        sdk.api.abi.call({
          target: ADDRESSES.LENDING_POOL,
          abi: abiLendingPool.find((m) => m.name === 'gloopStakersYieldFactor'),
          chain: CHAIN,
        }),
      ]);

    const reserveFactor = BigInt(reserveFactorResult.output);
    const gloopStakersYieldFactor = BigInt(
      gloopStakersYieldFactorResult.output
    );
    const oneE18 = BigInt('1000000000000000000'); // 1e18

    // Calculate the multiplier: 1 - (gloopStakersYieldFactor + reserveFactor) / 1e18
    const reductionFactor = gloopStakersYieldFactor + reserveFactor;
    const multiplierNumerator = oneE18 - reductionFactor;

    // Calculate raw supply rate: rawBorrowRate * multiplier
    const rawSupplyRate = (rawBorrowRate * multiplierNumerator) / oneE18;

    // Convert to APY percentage
    // APY = (rawSupplyRate * secondsPerYear / 1e18) * 100
    const supplyApyBigInt =
      (rawSupplyRate * BigInt(SECONDS_PER_YEAR) * BigInt(100)) / oneE18;

    return Number(supplyApyBigInt) / 100; // Convert back to decimal percentage
  } catch (error) {
    console.error('Error calculating supply APY:', error);
    return 0;
  }
};

module.exports = {
  getSupplyAPY,
};
