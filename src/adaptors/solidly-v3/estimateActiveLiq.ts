// forked from uniswap.fish chads (see https://github.com/chunza2542/uniswap.fish)
// modified univ3 adapter to just return the active liq fraction
const bn = require('bignumber.js');
const axios = require('axios');

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

const Q96 = new bn(2).pow(96);

const getTickFromPrice = (price, token0Decimal, token1Decimal) => {
  const token0 = expandDecimals(price, Number(token0Decimal));
  const token1 = expandDecimals(1, Number(token1Decimal));
  const sqrtPrice = encodeSqrtPriceX96(token1).div(encodeSqrtPriceX96(token0));

  return Math.log(sqrtPrice.toNumber()) / Math.log(Math.sqrt(1.0001));
};

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

/// get the percentage of active liquidity from the price assumption
const liquidityPercentage = (liquidityDelta, liquidity) => {
  // console.log("DELTA", liquidityDelta, "LIQ", liquidity)
  const liquidityPercentage = liquidityDelta
    .div(liquidity.plus(liquidityDelta))
    .toNumber();
  return liquidityPercentage;
};

// get 'active' liquidity
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

const getPoolTicks = async (poolAddress, url) => {
  const PAGE_SIZE = 3;
  let result = [];
  let page = 0;
  while (true) {
    const pool1 = await _getPoolTicksByPage(poolAddress, page, url);
    const pool2 = await _getPoolTicksByPage(poolAddress, page + 1, url);
    const pool3 = await _getPoolTicksByPage(poolAddress, page + 2, url);

    result = [...result, ...pool1, ...pool2, ...pool3];
    if (pool1.length === 0 || pool2.length === 0 || pool3.length === 0) {
      break;
    }
    page += PAGE_SIZE;
  }
  return result;
};

const _getPoolTicksByPage = async (poolAddress, page, url) => {
  let res;
  try {
    res = await _queryUniswap(
      `{
    ticks(first: 1000, skip: ${
      page * 1000
    }, where: { poolAddress: "${poolAddress}" }, orderBy: tickIdx) {
      tickIdx
      liquidityNet
      price0
      price1
    }
  }`,
      url
    );
  } catch (e) {
    console.log('_getPoolTicksByPage failed for', poolAddress);
    return [];
  }

  return res === undefined ? [] : res.ticks;
};

const _queryUniswap = async (query, url) => {
  const { data } = await axios({
    url,
    method: 'post',
    data: {
      query,
    },
  });

  return data.data;
};

module.exports.EstimateActiveLiq = async (
  poolAddress,
  priceAssumptionValue,
  priceRangeValue,
  currentPriceUSDToken1,
  currentPriceUSDToken0,
  depositAmountUSD,
  decimalsToken0,
  decimalsToken1,
  url
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
  const poolTicks = await getPoolTicks(poolAddress, url);

  if (!poolTicks.length) {
    console.log(`No pool ticks found for ${poolAddress}`);
    return { poolAddress, estimatedFee: 0 };
  }

  const L = getLiquidityFromTick(poolTicks, currentTick);

  const liq_percentage =
    P >= Pl && P <= Pu ? liquidityPercentage(deltaL, L) : 0;

  return liq_percentage;
};
