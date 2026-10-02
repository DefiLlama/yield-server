const BigNumber = require('bignumber.js');
const { DAY } = require('./metrics');

// Deployed risexUSDC epochs are six hours; allow one hour of keeper delay.
const MAX_AGE = 7 * 3600;
const WEEK = 7 * DAY;
const snapshot = (row) => {
  const price = new BigNumber(row.sharePrice ?? row[0]);
  const supply = new BigNumber(row.totalSupply ?? row[1]);
  const timestamp = Number(row.timestamp ?? row[2]);
  if (
    !price.isInteger() ||
    !price.gt(0) ||
    !supply.isInteger() ||
    !supply.gt(0) ||
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0
  ) {
    throw new Error('risexUSDC: invalid settled snapshot');
  }
  return { price, supply, timestamp };
};

const metrics = (history, blockTimestamp, totalAssets, assetDecimals) => {
  if (!history.length) throw new Error('risexUSDC: no settled history');
  const current = snapshot(history[history.length - 1]);
  const age = blockTimestamp - current.timestamp;
  if (!Number.isSafeInteger(blockTimestamp) || age < 0 || age > MAX_AGE) {
    throw new Error('risexUSDC: stale or future settlement');
  }
  if (
    !Number.isInteger(assetDecimals) ||
    assetDecimals < 0 ||
    assetDecimals > 36
  ) {
    throw new Error('risexUSDC: invalid asset decimals');
  }
  const assets = new BigNumber(totalAssets);
  if (!assets.isInteger() || !assets.gt(0)) {
    throw new Error('risexUSDC: invalid total assets');
  }
  const annualized = (window) => {
    const row = [...history].reverse().find((r) => {
      const time = Number(r.timestamp ?? r[2]);
      return time > 0 && time <= current.timestamp - window;
    });
    if (!row) throw new Error('risexUSDC: missing return history');
    const past = snapshot(row);
    const elapsed = current.timestamp - past.timestamp;
    if (elapsed > window + MAX_AGE) {
      throw new Error('risexUSDC: stale return baseline');
    }
    // Settled PPS includes fee dilution. Supply changes do not create returns.
    const apy =
      Math.expm1(
        (Math.log(current.price.div(past.price).toNumber()) * 365 * DAY) /
          elapsed
      ) * 100;
    if (!Number.isFinite(apy)) throw new Error('risexUSDC: non-finite APY');
    return apy;
  };
  const apyBase = annualized(DAY);
  let apyBase7d;
  try {
    apyBase7d = annualized(WEEK);
  } catch (e) {
    // The seven-day comparison is optional; the daily result is mandatory.
  }
  const tvlUnderlying = assets.shiftedBy(-assetDecimals).toNumber();
  const pricePerShare = current.price.shiftedBy(-assetDecimals).toNumber();
  if (![tvlUnderlying, pricePerShare].every(Number.isFinite)) {
    throw new Error('risexUSDC: non-finite vault values');
  }
  return { apyBase, apyBase7d, tvlUnderlying, pricePerShare };
};

module.exports = { MAX_AGE, metrics };
