const BigNumber = require('bignumber.js');

const Big = BigNumber.clone({ DECIMAL_PLACES: 80 });
const MAX_SUPPORTED_DECIMALS = 36;
const SECONDS_PER_YEAR = 31536000;

function finiteBig(value, name) {
  const accepted =
    typeof value === 'string' ||
    typeof value === 'number' ||
    BigNumber.isBigNumber(value);
  const unsafeInteger =
    typeof value === 'number' &&
    Number.isInteger(value) &&
    !Number.isSafeInteger(value);
  if (
    !accepted ||
    unsafeInteger ||
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

function precision(value) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_SUPPORTED_DECIMALS
  ) {
    throw new Error('Invalid precision');
  }
  return value;
}

function finiteNumber(value) {
  const number = value.toNumber();
  if (!Number.isFinite(number)) throw new Error('Numeric overflow');
  if (!value.isZero() && number === 0) throw new Error('Numeric underflow');
  return number;
}

function unsignedRaw(value, name) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
  return new Big(value);
}

function value(raw, decimals, price) {
  const amount = nonNegativeBig(raw, 'balance');
  const tokenPrice = finiteBig(price, 'price');
  const tokenDecimals = precision(decimals);
  if (!tokenPrice.gt(0)) throw new Error('Invalid price');

  return finiteNumber(amount.shiftedBy(-tokenDecimals).times(tokenPrice));
}

function rate(rewardPerSec, locked, remaining) {
  const speed = nonNegativeBig(rewardPerSec, 'reward speed');
  const balance = finiteBig(locked, 'locked balance');
  const reserve = nonNegativeBig(remaining, 'remaining reward');
  if (!balance.gt(0)) throw new Error('Invalid locked balance');
  if (reserve.isZero()) return 0;

  const annualRate = speed.times(SECONDS_PER_YEAR).div(balance).times(100);
  if (!speed.isZero() && annualRate.isZero()) {
    throw new Error('Numeric underflow');
  }
  return finiteNumber(annualRate);
}

function assertConservation(
  locked,
  undistributed,
  currentLocked,
  currentUndistributed
) {
  const stored = unsignedRaw(locked, 'locked balance').plus(
    unsignedRaw(undistributed, 'undistributed reward')
  );
  const current = unsignedRaw(currentLocked, 'current locked balance').plus(
    unsignedRaw(currentUndistributed, 'current undistributed reward')
  );
  if (!stored.eq(current)) throw new Error('RHEA reward conservation failed');
}

function assertShareIdentity(
  underlyingRaw,
  shareSupplyRaw,
  pricePerShareRaw,
  priceDecimals
) {
  const scale = new Big(10).pow(precision(priceDecimals));
  const underlying = unsignedRaw(underlyingRaw, 'underlying balance');
  const supply = unsignedRaw(shareSupplyRaw, 'share supply');
  const pricePerShare = unsignedRaw(pricePerShareRaw, 'price per share');
  if (!supply.gt(0) || !pricePerShare.gt(0)) {
    throw new Error('Invalid share identity inputs');
  }

  const difference = underlying
    .times(scale)
    .minus(supply.times(pricePerShare))
    .abs();
  const tolerance = supply.plus(scale);
  if (difference.gt(tolerance)) throw new Error('Share identity failed');
}

module.exports = {
  value,
  rate,
  assertConservation,
  assertShareIdentity,
};
