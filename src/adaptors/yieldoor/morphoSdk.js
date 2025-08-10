const AdaptiveCurveIrmLib = require('./adaptiveCurveIrmLib');
const MathLib = require('./mathLib');
const SharesMath = require('./sharesMath');

const getUtilization = (
  totalSupplyAssets,
  totalBorrowAssets,
) => {
  totalSupplyAssets = BigInt(totalSupplyAssets);
  totalBorrowAssets = BigInt(totalBorrowAssets);

  if (totalSupplyAssets === 0n) {
    if (totalBorrowAssets > 0n) return MathLib.MAX_UINT_256;

    return 0n;
  }

  return MathLib.wDivDown(totalBorrowAssets, totalSupplyAssets);
}

const toBorrowAssets = (
  shares,
  market,
  rounding = "Up",
) => {
  return SharesMath.toAssets(
    shares,
    market.totalBorrowAssets,
    market.totalBorrowShares,
    rounding,
  );
}

/**
 * Returns the value of a given amount of collateral quoted in loan assets.
 * Return `undefined` iff the market's price is undefined.
 */
const getCollateralValue = (
  collateral,
  { price }
) => {
  if (price == null) return;

  return MathLib.mulDivDown(collateral, price, AdaptiveCurveIrmLib.ORACLE_PRICE_SCALE);
}

/**
 * Returns the loan-to-value ratio of a given borrow position (scaled by WAD).
 * Returns `undefined` iff the market's price is undefined.
 * Returns null if the position is not a borrow.
 */
const getLtv = (
  {
    collateral,
    borrowShares,
  },
  market,
) => {
  borrowShares = BigInt(borrowShares);
  market.totalBorrowShares = BigInt(market.totalBorrowShares);
  if (borrowShares === 0n || market.totalBorrowShares === 0n) return null;

  const collateralValue = getCollateralValue(collateral, market);
  if (collateralValue == null) return;
  if (collateralValue === 0n) return MathLib.MAX_UINT_256;

  return MathLib.wDivUp(
    toBorrowAssets(borrowShares, market),
    collateralValue,
  );
}

const getBorrowApy = (market, timestamp) => {
  const borrowRate = getBorrowRate(market, timestamp);

  return MathLib.wTaylorCompounded(borrowRate, AdaptiveCurveIrmLib.SECONDS_PER_YEAR);
}

const getBorrowRate = (market, timestamp) => {
  if (market.rateAtTarget == null) return 0n;

  timestamp = BigInt(timestamp);

  const elapsed = timestamp - BigInt(market.lastUpdate);

  if (elapsed < 0n)
    throw new Error(`Invalid interest accrual: ${market.id}, ${timestamp}, ${market.lastUpdate}`);

  const { endBorrowRate } = AdaptiveCurveIrmLib.getBorrowRate(
    market.utilization,
    market.rateAtTarget,
    elapsed,
  );

  return endBorrowRate;
}

const getAccrualBorrowRate = (position, marketId, timestamp, lastUpdate) => {
  timestamp = BigInt(timestamp);

  const elapsed = timestamp - lastUpdate;
  if (elapsed < 0n)
      throw new Error(`Invalid interest accrual: ${marketId}, ${timestamp}, ${lastUpdate}`);

  if (position.rateAtTarget == null)
    return {
      elapsed,
      avgBorrowRate: 0n,
      endBorrowRate: 0n,
    };

  return {
    elapsed,
    ...AdaptiveCurveIrmLib.getBorrowRate(
      position.utilization,
      position.rateAtTarget,
      elapsed,
    ),
  };
}


/**
 * Returns the interest accrued on both sides of the given market
 * as well as the supply shares minted to the fee recipient.
 * @param borrowRate The average borrow rate since the last market update (scaled by WAD).
 * @param market The market state.
 * @param elapsed The time elapsed since the last market update (in seconds).
 */
const getAccruedInterest = (
  borrowRate,
  {
      totalSupplyAssets,
      totalBorrowAssets,
      totalSupplyShares,
      fee,
  },
  elapsed = 0n,
  ) => {
  const interest = MathLib.wMulDown(
      totalBorrowAssets,
      MathLib.wTaylorCompounded(borrowRate, elapsed),
  );

  const feeAmount = MathLib.wMulDown(interest, fee);
  const feeShares = toSupplyShares(
      feeAmount,
      {
      totalSupplyAssets: BigInt(totalSupplyAssets) - feeAmount,
      totalSupplyShares,
      },
      "Down",
  );

  return { interest, feeShares };
}


const toSupplyShares = (
  assets,
  market,
  rounding = "Up",
) => {
  return SharesMath.toShares(
    assets,
    market.totalSupplyAssets,
    market.totalSupplyShares,
    rounding,
  );
}

module.exports = {
  getUtilization,
  getAccrualBorrowRate,
  getAccruedInterest,
  toSupplyShares,
  getBorrowApy,
  getBorrowRate,
  getCollateralValue,
  getLtv,
  toBorrowAssets,
};