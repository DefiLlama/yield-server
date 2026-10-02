// Jest discovers .test.js in the normal adapter CI run; node --test remains
// available for running the calculation regressions without live API calls.
const test = globalThis.test || require('node:test').test;
const assert = require('node:assert/strict');
const { metrics, DAY } = require('./metrics');

const NOW = 1790935224;
const FRESHNESS = 4200;
const entry = (price, shares, timestamp) => ({
  value: String(Math.round(price * shares * 1e6)),
  supplySnapshot: (BigInt(shares) * 10n ** 18n).toString(),
  timestamp: String(timestamp),
});
const run = (entries, now = NOW) => metrics(entries, now, FRESHNESS, 6, 18);
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8);

test('NAV/share growth remains neutral to deposited capital', () => {
  const result = run([entry(1.001, 200000, NOW), entry(1, 100000, NOW - DAY)]);
  near(result.apyBase, (1.001 ** 365 - 1) * 100);
  near(result.tvlUnderlying, 200200);
  near(result.pricePerShare, 1.001);
});

test('withdrawal capital and share burn do not create yield', () => {
  near(run([entry(1, 50000, NOW), entry(1, 100000, NOW - DAY)]).apyBase, 0);
});

test('fee shares reflected in the next snapshot dilute returns once', () => {
  const current = entry(1, 100100, NOW);
  current.value = '100200000000';
  const result = run([current, entry(1, 100000, NOW - DAY)]);
  near(result.apyBase, ((100200 / 100100) ** 365 - 1) * 100);
});

test('genuine negative share-price returns are preserved', () => {
  const result = run([entry(0.999, 100000, NOW), entry(1, 100000, NOW - DAY)]);
  near(result.apyBase, (0.999 ** 365 - 1) * 100);
  assert.ok(result.apyBase < 0);
});

test('uses observed elapsed time, not a fixed denominator', () => {
  const result = run([
    entry(1.001, 100000, NOW),
    entry(1, 100000, NOW - DAY - 3600),
  ]);
  near(result.apyBase, (1.001 ** ((365 * DAY) / (DAY + 3600)) - 1) * 100);
});

test('duplicate current timestamps do not replace the 24h baseline', () => {
  const result = run([
    entry(1.001, 100000, NOW),
    entry(1.0009, 100000, NOW),
    entry(1, 100000, NOW - DAY),
  ]);
  near(result.apyBase, (1.001 ** 365 - 1) * 100);
});

test('accepts SDK tuple-array output as well as named output', () => {
  const entries = [entry(1.001, 100000, NOW), entry(1, 100000, NOW - DAY)].map(
    ({ value, timestamp, supplySnapshot }) => [value, timestamp, supplySnapshot]
  );
  near(run(entries).pricePerShare, 1.001);
});

test('rejects stale or future latest observations', () => {
  const entries = [entry(1.001, 100000, NOW), entry(1, 100000, NOW - DAY)];
  assert.throws(() => run(entries, NOW + FRESHNESS + 1), /stale or future/);
  assert.throws(() => run(entries, NOW - 1), /stale or future/);
});

test('rejects missing history and stale baselines instead of reporting zero APY', () => {
  assert.throws(() => run([entry(1, 100000, NOW)]), /missing return/);
  assert.throws(
    () =>
      run([entry(1, 100000, NOW), entry(1, 100000, NOW - DAY - FRESHNESS - 1)]),
    /stale return baseline/
  );
});

test('rejects empty or zero-value observations, including the initialization entry', () => {
  assert.throws(() => run([]), /no TVL history/);
  assert.throws(
    () => run([entry(1, 0, NOW), entry(1, 100000, NOW - DAY)]),
    /invalid/
  );
  assert.throws(
    () => run([entry(0, 100000, NOW), entry(1, 100000, NOW - DAY)]),
    /invalid/
  );
  assert.throws(
    () => run([entry(1, 100000, NOW), entry(0, 0, NOW - DAY)]),
    /invalid/
  );
});

test('rejects non-finite annualization instead of inventing a capped APY', () => {
  assert.throws(
    () => run([entry(1000, 100000, NOW), entry(1, 100000, NOW - DAY)]),
    /non-finite/
  );
});

test('validates decimals and freshness', () => {
  const entries = [entry(1, 100000, NOW), entry(1, 100000, NOW - DAY)];
  assert.throws(() => metrics(entries, NOW, 0, 6, 18), /stale or future/);
  assert.throws(
    () => metrics(entries, NOW, FRESHNESS, 6, 18.5),
    /invalid token decimals/
  );
});

test('calculates the optional 7d APY using the same matched-observation method', () => {
  const entries = [
    entry(1.003, 200000, NOW),
    entry(1.002, 150000, NOW - DAY),
    entry(1, 100000, NOW - 7 * DAY),
  ];
  const result = metrics(entries, NOW, FRESHNESS, 6, 18, 7 * DAY);
  near(result.apyBase, (1.003 ** (365 / 7) - 1) * 100);
});
