const { SqrtPriceMath } = require('@uniswap/v3-sdk');
const JSBI = require('jsbi')

const getAmountsForLiquidity = (
  sqrtRatioX96: typeof JSBI,
  sqrtRatioAX96: typeof JSBI,
  sqrtRatioBX96: typeof JSBI,
  liquidity: typeof JSBI
): { amount0: typeof JSBI; amount1: typeof JSBI } => {
  if (JSBI.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
    ;[sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96]
  }

  let amount0 = JSBI.BigInt(0)
  let amount1 = JSBI.BigInt(0)

  if (JSBI.lessThanOrEqual(sqrtRatioX96, sqrtRatioAX96)) {
    amount0 = SqrtPriceMath.getAmount0Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, false)
  } else if (JSBI.lessThan(sqrtRatioX96, sqrtRatioBX96)) {
    amount0 = SqrtPriceMath.getAmount0Delta(sqrtRatioX96, sqrtRatioBX96, liquidity, false)
    amount1 = SqrtPriceMath.getAmount1Delta(sqrtRatioAX96, sqrtRatioX96, liquidity, false)
  } else {
    amount1 = SqrtPriceMath.getAmount1Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, false)
  }
  return { amount0, amount1 }
}

module.exports = { getAmountsForLiquidity }