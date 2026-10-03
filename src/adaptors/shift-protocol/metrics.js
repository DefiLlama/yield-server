const BigNumber = require('bignumber.js');

const DAY = 86400;
const YEAR = 365 * DAY;

const timestampOf = (entry) => Number(entry.timestamp ?? entry[1]);

const observation = (entry) => {
  const value = new BigNumber(entry.value ?? entry[0]);
  const supply = new BigNumber(entry.supplySnapshot ?? entry[2]);
  const timestamp = timestampOf(entry);
  if (
    !value.isInteger() ||
    !value.gt(0) ||
    !supply.isInteger() ||
    !supply.gt(0) ||
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0
  ) {
    throw new Error('ltLLP: invalid TVL observation');
  }
  return { value, supply, timestamp };
};

const findPast = (entries, window = DAY) =>
  entries.find(
    (entry) => timestampOf(entry) <= timestampOf(entries[0]) - window
  );

const metrics = (
  entries,
  blockTimestamp,
  freshness,
  assetDecimals,
  shareDecimals,
  window = DAY
) => {
  if (!entries.length) throw new Error('ltLLP: no TVL history');
  const current = observation(entries[0]);
  const age = blockTimestamp - current.timestamp;
  if (
    !Number.isSafeInteger(freshness) ||
    freshness <= 0 ||
    age < 0 ||
    age > freshness
  ) {
    throw new Error('ltLLP: stale or future TVL observation');
  }
  const pastEntry = findPast(entries, window);
  if (!pastEntry) throw new Error('ltLLP: missing return history');
  const past = observation(pastEntry);
  const elapsed = current.timestamp - past.timestamp;
  if (elapsed < window || elapsed > window + freshness) {
    throw new Error('ltLLP: stale return baseline');
  }
  for (const decimals of [assetDecimals, shareDecimals]) {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw new Error('ltLLP: invalid token decimals');
    }
  }
  // Both numerator/denominator pairs come from the same feed observation.
  // Using live totalSupply with an older NAV would treat deposits as losses.
  const ratio = current.value
    .times(past.supply)
    .div(current.supply.times(past.value));
  const apyBase =
    Math.expm1((Math.log(ratio.toNumber()) * YEAR) / elapsed) * 100;
  const tvlUnderlying = current.value.shiftedBy(-assetDecimals).toNumber();
  const pricePerShare = current.value
    .div(current.supply)
    .shiftedBy(shareDecimals - assetDecimals)
    .toNumber();
  if (![apyBase, tvlUnderlying, pricePerShare].every(Number.isFinite)) {
    throw new Error('ltLLP: non-finite metrics');
  }
  return { apyBase, tvlUnderlying, pricePerShare };
};

module.exports = { DAY, findPast, metrics };
