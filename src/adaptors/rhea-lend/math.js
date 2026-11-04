const Big = require('bignumber.js');

const MAX_SUPPORTED_DECIMALS = 36;

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

function finiteNumber(value) {
  const number = value.toNumber();
  if (!Number.isFinite(number)) throw new Error('Numeric overflow');
  if (!value.isZero() && number === 0) throw new Error('Numeric underflow');
  return number;
}

function validPrecision(value, name) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_SUPPORTED_DECIMALS
  ) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

function decimalPrecision(decimals, extraDecimals) {
  const precision = decimals + extraDecimals;
  if (!Number.isSafeInteger(precision) || precision > MAX_SUPPORTED_DECIMALS) {
    throw new Error('Invalid total decimals');
  }
  return precision;
}

function lendingAmounts(asset, decimals, price) {
  const tokenDecimals = validPrecision(decimals, 'decimals');
  const extraDecimals = validPrecision(
    asset.config.extra_decimals,
    'extra decimals'
  );
  const tokenPrice = finiteBig(price, 'price');
  if (!tokenPrice.gt(0)) throw new Error('Invalid price');

  const supplied = nonNegativeBig(asset.supplied.balance, 'supplied');
  const reserved = nonNegativeBig(asset.reserved, 'reserved');
  const protocolFee = nonNegativeBig(asset.prot_fee, 'prot_fee');
  const borrowed = nonNegativeBig(asset.borrowed.balance, 'borrowed');
  const marginDebtValue =
    asset.margin_debt === undefined ? '0' : asset.margin_debt?.balance;
  const pendingDebtValue =
    asset.margin_pending_debt === undefined ? '0' : asset.margin_pending_debt;
  const marginDebt = nonNegativeBig(marginDebtValue, 'margin debt');
  const pendingDebt = nonNegativeBig(pendingDebtValue, 'pending debt');
  const rate = nonNegativeBig(asset.supply_apr, 'supply_apr').times(100);

  const supply = supplied.plus(reserved).plus(protocolFee);
  const borrow = borrowed.plus(marginDebt).plus(pendingDebt);
  if (supply.lt(borrow)) throw new Error('Unexpected lending accounting');

  const precision = decimalPrecision(tokenDecimals, extraDecimals);
  const bigResult = {
    totalSupplyUsd: supply.shiftedBy(-precision).times(tokenPrice),
    totalBorrowUsd: borrow.shiftedBy(-precision).times(tokenPrice),
    tvlUsd: supply.minus(borrow).shiftedBy(-precision).times(tokenPrice),
    apyBase: rate,
  };

  return Object.fromEntries(
    Object.entries(bigResult).map(([name, value]) => [
      name,
      finiteNumber(value),
    ])
  );
}

module.exports = { lendingAmounts };
