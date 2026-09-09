const Big = require('bignumber.js');

const FeeBig = Big.clone({ DECIMAL_PLACES: 340 });

function finiteBig(value, name) {
  const isAcceptedType =
    typeof value === 'string' ||
    typeof value === 'number' ||
    Big.isBigNumber(value);
  const isUnsafeInteger =
    typeof value === 'number' &&
    Number.isInteger(value) &&
    !Number.isSafeInteger(value);
  if (
    !isAcceptedType ||
    isUnsafeInteger ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw new Error(`Invalid ${name}`);
  }

  const number = new Big(value);
  if (!number.isFinite()) throw new Error(`Invalid ${name}`);
  return number;
}

function nonNegativeBig(value, name) {
  const number = finiteBig(value, name);
  if (number.lt(0)) throw new Error(`Invalid ${name}`);
  return number;
}

function finiteNumber(value, nonzeroExpected = !value.isZero()) {
  const number = value.toNumber();
  if (!Number.isFinite(number)) throw new Error('Numeric overflow');
  if (nonzeroExpected && number === 0) throw new Error('Numeric underflow');
  return number;
}

function validPrecision(value) {
  const maximumExponent = Big.config().RANGE[1];
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximumExponent
  ) {
    throw new Error('Invalid pool precision');
  }
  return value;
}

function lpTvl(amounts, decimals, prices) {
  if (
    !Array.isArray(amounts) ||
    !Array.isArray(decimals) ||
    !Array.isArray(prices) ||
    amounts.length === 0 ||
    amounts.length !== decimals.length ||
    amounts.length !== prices.length
  ) {
    throw new Error('Mismatched pool arrays');
  }

  const value = amounts.reduce((sum, amount, index) => {
    const tokenAmount = nonNegativeBig(amount, 'pool amount');
    const tokenPrice = finiteBig(prices[index], 'pool price');
    if (!tokenPrice.gt(0)) throw new Error('Invalid pool price');
    const tokenDecimals = validPrecision(decimals[index]);
    return sum.plus(tokenAmount.shiftedBy(-tokenDecimals).times(tokenPrice));
  }, new Big(0));

  if (!value.gt(0)) throw new Error('Invalid pool TVL');
  return finiteNumber(value);
}

function feeAnnualPercent(feeUsd24h, tvlUsd) {
  const fee = nonNegativeBig(feeUsd24h, 'fee');
  const tvl = finiteBig(tvlUsd, 'TVL');
  if (!tvl.gt(0)) throw new Error('Invalid TVL');

  const percentage = new FeeBig(fee.toString())
    .times(36500)
    .div(new FeeBig(tvl.toString()));
  return finiteNumber(percentage, fee.gt(0));
}

module.exports = { lpTvl, feeAnnualPercent };
