// forked from  https://github.com/chunza2542/uniswap.fish

const bn = require('bignumber.js');

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

const Q96 = new bn(2).pow(96);

const getTickFromPrice = (price, token0Decimal, token1Decimal) => {
  const token0 = expandDecimals(price, Number(token0Decimal));
  const token1 = expandDecimals(1, Number(token1Decimal));
  const sqrtPrice = encodeSqrtPriceX96(token1).div(encodeSqrtPriceX96(token0));

  return Math.log(sqrtPrice.toNumber()) / Math.log(Math.sqrt(1.0001));
};

// for calculation detail, please visit README.md (Section: Calculation Breakdown, No. 1)
const getTokensAmountFromDepositAmountUSD = (
  P,
  Pl,
  Pu,
  priceUSDX,
  priceUSDY,
  depositAmountUSD
) => {
  const deltaL =
    depositAmountUSD /
    ((Math.sqrt(P) - Math.sqrt(Pl)) * priceUSDY +
      (1 / Math.sqrt(P) - 1 / Math.sqrt(Pu)) * priceUSDX);

  let deltaY = deltaL * (Math.sqrt(P) - Math.sqrt(Pl));
  if (deltaY * priceUSDY < 0) deltaY = 0;
  if (deltaY * priceUSDY > depositAmountUSD)
    deltaY = depositAmountUSD / priceUSDY;

  let deltaX = deltaL * (1 / Math.sqrt(P) - 1 / Math.sqrt(Pu));
  if (deltaX * priceUSDX < 0) deltaX = 0;
  if (deltaX * priceUSDX > depositAmountUSD)
    deltaX = depositAmountUSD / priceUSDX;

  return { amount0: deltaX, amount1: deltaY };
};

// for calculation detail, please visit README.md (Section: Calculation Breakdown, No. 2)
const getLiquidityForAmount0 = (sqrtRatioAX96, sqrtRatioBX96, amount0) => {
  // amount0 * (sqrt(upper) * sqrt(lower)) / (sqrt(upper) - sqrt(lower))
  const intermediate = mulDiv(sqrtRatioBX96, sqrtRatioAX96, Q96);
  return mulDiv(amount0, intermediate, sqrtRatioBX96.minus(sqrtRatioAX96));
};

const getLiquidityForAmount1 = (sqrtRatioAX96, sqrtRatioBX96, amount1) => {
  // amount1 / (sqrt(upper) - sqrt(lower))
  return mulDiv(amount1, Q96, sqrtRatioBX96.minus(sqrtRatioAX96));
};

const getSqrtPriceX96 = (price, token0Decimal, token1Decimal) => {
  const token0 = expandDecimals(price, token0Decimal);
  const token1 = expandDecimals(1, token1Decimal);

  return token0.div(token1).sqrt().multipliedBy(Q96);
};

const getLiquidityDelta = (
  P,
  lowerP,
  upperP,
  amount0,
  amount1,
  token0Decimal,
  token1Decimal
) => {
  const amt0 = expandDecimals(amount0, token1Decimal);
  const amt1 = expandDecimals(amount1, token0Decimal);

  const sqrtRatioX96 = getSqrtPriceX96(P, token0Decimal, token1Decimal);
  const sqrtRatioAX96 = getSqrtPriceX96(lowerP, token0Decimal, token1Decimal);
  const sqrtRatioBX96 = getSqrtPriceX96(upperP, token0Decimal, token1Decimal);

  let liquidity;
  if (sqrtRatioX96.lte(sqrtRatioAX96)) {
    liquidity = getLiquidityForAmount0(sqrtRatioAX96, sqrtRatioBX96, amt0);
  } else if (sqrtRatioX96.lt(sqrtRatioBX96)) {
    const liquidity0 = getLiquidityForAmount0(
      sqrtRatioX96,
      sqrtRatioBX96,
      amt0
    );
    const liquidity1 = getLiquidityForAmount1(
      sqrtRatioAX96,
      sqrtRatioX96,
      amt1
    );

    liquidity = bn.min(liquidity0, liquidity1);
  } else {
    liquidity = getLiquidityForAmount1(sqrtRatioAX96, sqrtRatioBX96, amt1);
  }

  return liquidity;
};

const estimateFee = (liquidityDelta, liquidity, volume24H, feeTier) => {
  const feeTierPercentage = getFeeTierPercentage(feeTier);
  const liquidityPercentage = liquidityDelta
    .div(liquidity.plus(liquidityDelta))
    .toNumber();

  return feeTierPercentage * volume24H * liquidityPercentage;
};

const getLiquidityFromTick = (poolTicks, tick) => {
  // calculate a cumulative of liquidityNet from all ticks that poolTicks[i] <= tick
  let liquidity = new bn(0);
  for (let i = 0; i < poolTicks.length - 1; ++i) {
    liquidity = liquidity.plus(new bn(poolTicks[i].liquidityNet));

    const lowerTick = Number(poolTicks[i].tickIdx);
    const upperTick = Number(poolTicks[i + 1]?.tickIdx);

    if (lowerTick <= tick && tick <= upperTick) {
      break;
    }
  }

  return liquidity;
};

// private helper functions
const encodeSqrtPriceX96 = (price) => {
  return new bn(price).sqrt().multipliedBy(Q96).integerValue(3);
};

const expandDecimals = (n, exp) => {
  return new bn(n).multipliedBy(new bn(10).pow(exp));
};

const mulDiv = (a, b, multiplier) => {
  return a.multipliedBy(b).div(multiplier);
};

const getFeeTierPercentage = (tier) => {
  if (tier === '100') return 0.01 / 100;
  if (tier === '500') return 0.05 / 100;
  if (tier === '3000') return 0.3 / 100;
  if (tier === '10000') return 1 / 100;
  return 0;
};

module.exports.EstimatedFees = (
  priceAssumptionValue,
  priceRangeValue,
  currentPriceUSDToken1,
  currentPriceUSDToken0,
  depositAmountUSD,
  decimalsToken0,
  decimalsToken1,
  feeTier,
  volume,
  poolTicks
) => {
  const P = priceAssumptionValue;
  let Pl = priceRangeValue[0];
  let Pu = priceRangeValue[1];
  const priceUSDX = currentPriceUSDToken1 || 1;
  const priceUSDY = currentPriceUSDToken0 || 1;

  const { amount0, amount1 } = getTokensAmountFromDepositAmountUSD(
    P,
    Pl,
    Pu,
    priceUSDX,
    priceUSDY,
    depositAmountUSD
  );

  const deltaL = getLiquidityDelta(
    P,
    Pl,
    Pu,
    amount0,
    amount1,
    Number(decimalsToken0 || 18),
    Number(decimalsToken1 || 18)
  );

  let currentTick = getTickFromPrice(
    P,
    decimalsToken0 || '18',
    decimalsToken1 || '18'
  );

  const L = getLiquidityFromTick(poolTicks, currentTick);

  const estimatedFee =
    P >= Pl && P <= Pu ? estimateFee(deltaL, L, volume, feeTier) : 0;

  return estimatedFee;
};
