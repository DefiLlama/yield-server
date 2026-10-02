const { test } = require('node:test');
const assert = require('node:assert/strict');
const { metrics, MAX_AGE } = require('./risex-metrics');
const { iface, verifySettlement } = require('./risex-settlement');
const DAY = 86400;
const NOW = 1790920871;
const VAULT = '0x5f70e536190c15e5959dbfef2f2632e540da74cd';
const SHARE = '0xdbe599c184cc13d82f956fa5adaa1b18c0ff67d3';
const ZERO = '0x0000000000000000000000000000000000000000';
const USER = '0x0000000000000000000000000000000000000001';
const row = (sharePrice, totalSupply, timestamp) => ({
  sharePrice: String(sharePrice),
  totalSupply: String(totalSupply),
  timestamp: String(timestamp),
});
const history = [row(1000000, 100000, NOW - DAY), row(1001000, 200000, NOW)];
const run = (rows = history, now = NOW, assets = '200200000000') =>
  metrics(rows, now, assets, 6);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8);

test('capital deposits cannot masquerade as RiseX yield', () => {
  const result = run(
    [row(1000000, 100000, NOW - DAY), row(1000000, 200000, NOW)],
    NOW,
    '200000000000'
  );
  near(result.apyBase, 0);
  near(result.tvlUnderlying, 200000);
});
test('redemption burns and current TVL do not change settled-price returns', () => {
  const result = run(
    [row(1000000, 200000, NOW - DAY), row(1000000, 100000, NOW)],
    NOW,
    '90000000000'
  );
  near(result.apyBase, 0);
  near(result.tvlUnderlying, 90000);
});
test('uses already diluted net PPS without an additional fee haircut', () => {
  const result = run([
    row(1000000, 100000, NOW - DAY),
    row(1000909, 100009, NOW),
  ]);
  near(result.apyBase, (1.000909 ** 365 - 1) * 100);
  near(result.pricePerShare, 1.000909);
});
test('preserves losses and measures actual time through delayed settlement', () => {
  const result = run([
    row(1001000, 100000, NOW - DAY - 3600),
    row(1000000, 100000, NOW),
  ]);
  near(
    result.apyBase,
    ((1000000 / 1001000) ** ((365 * DAY) / (DAY + 3600)) - 1) * 100
  );
  assert.ok(result.apyBase < 0);
});
test('catch-up epochs at duplicate timestamps do not become a daily window', () => {
  const result = run([
    row(1000000, 100000, NOW - DAY),
    row(1000900, 100000, NOW),
    row(1001000, 100000, NOW),
  ]);
  near(result.apyBase, (1.001 ** 365 - 1) * 100);
});
test('uses six-decimal PPS even though receipt tokens have 18 decimals', () => {
  near(run().pricePerShare, 1.001);
  const tuples = history.map((r) => [r.sharePrice, r.totalSupply, r.timestamp]);
  near(run(tuples).pricePerShare, 1.001);
});
test('seven-day APY uses settled timestamps and is omitted when unavailable', () => {
  assert.equal(run().apyBase7d, undefined);
  const result = run([row(1000000, 100000, NOW - 7 * DAY), ...history]);
  near(result.apyBase7d, (1.001 ** (365 / 7) - 1) * 100);
});
test('rejects stale/future prices, missing daily history and stale baselines', () => {
  assert.throws(() => run(history, NOW + MAX_AGE + 1), /stale or future/);
  assert.throws(() => run(history, NOW - 1), /stale or future/);
  assert.throws(() => run([history[1]]), /missing return history/);
  assert.throws(
    () => run([row(1000000, 100000, NOW - DAY - MAX_AGE - 1), history[1]]),
    /stale return baseline/
  );
});
test('zero initialization cannot become an investment-return baseline', () => {
  assert.throws(
    () => run([row(1000000, 0, 0), history[1]]),
    /missing return history/
  );
  assert.throws(
    () => run([history[0], row(0, 0, NOW)]),
    /invalid settled snapshot/
  );
});
test('rejects invalid assets and overflowing annualization', () => {
  assert.throws(() => run(history, NOW, '0'), /invalid total assets/);
  assert.throws(
    () => metrics(history, NOW, '100000000', 6.5),
    /invalid asset decimals/
  );
  assert.throws(
    () => run([row(1, 100000, NOW - DAY), row(1000000000, 100000, NOW)]),
    /non-finite APY/
  );
});

const event = (name, args, address = VAULT) => ({
  address,
  ...iface.encodeEventLog(iface.getEvent(name), args),
});
const settlement = (proposal = 1001000, stored = proposal) => {
  const current = row(stored, 100000, NOW);
  return {
    tx: {
      to: VAULT,
      input: iface.encodeFunctionData('epochSettle', [proposal]),
    },
    receipt: {
      status: '0x1',
      blockNumber: 100,
      logs: [event('SharePriceUpdated', [42, stored, 1000000, 100000, NOW])],
    },
    vault: VAULT,
    share: SHARE,
    epoch: 42,
    current,
    anchorBlock: 101,
  };
};
test('accepts a direct nonzero keeper valuation, including genuine flat NAV', () => {
  verifySettlement(settlement());
  const flat = settlement(1000000);
  flat.tx.data = flat.tx.input;
  delete flat.tx.input;
  verifySettlement(flat);
});
test('rejects emergency zero proposals and ignored allocator-active proposals', () => {
  assert.throws(() => verifySettlement(settlement(0, 1000000)), /unverified/);
  assert.throws(
    () => verifySettlement(settlement(1100000, 1000000)),
    /unverified/
  );
});
test('reconstructs net PPS across fee and deposit mints in one transaction', () => {
  const net = Number((1100000n * 100000n) / 100909n);
  const data = settlement(1100000, net);
  data.current.totalSupply = '110909';
  data.receipt.logs = [
    event('Transfer', [ZERO, USER, 909], SHARE),
    event('PerformanceFeeCollected', [42, 1100000, 1000000, 909]),
    event('Transfer', [ZERO, USER, 10000], SHARE),
    event('SharePriceUpdated', [42, net, 1000000, 110909, NOW]),
  ];
  verifySettlement(data);
  data.current.sharePrice = String(net + 1);
  assert.throws(() => verifySettlement(data), /unverified/);
});
test('validates a maintenance deduction instead of treating it as stale NAV', () => {
  const data = settlement(1001000, 1000990);
  data.receipt.logs.unshift(
    event('MaintenanceFeeCollected', [42, 1, 1001000, 1000990])
  );
  verifySettlement(data);
  data.receipt.logs[0] = event(
    'MaintenanceFeeCollected',
    [42, 1, 1001001, 1000990]
  );
  assert.throws(() => verifySettlement(data), /unverified/);
});
test('rejects failed, future, gateway and malformed settlement transactions', () => {
  const failed = settlement();
  failed.receipt.status = '0x0';
  const future = settlement();
  future.receipt.blockNumber = 102;
  const gateway = settlement();
  gateway.tx.to = USER;
  const malformed = settlement();
  malformed.tx.input += '00';
  for (const data of [failed, future, gateway, malformed])
    assert.throws(() => verifySettlement(data), /unverified/);
});
test('rejects mismatched history, epochs, fee mints and missing events', () => {
  const epoch = settlement();
  epoch.epoch = 43;
  const supply = settlement();
  supply.current.totalSupply = '99999';
  const time = settlement();
  time.current.timestamp = String(NOW - 1);
  const missing = settlement();
  missing.receipt.logs = [];
  const fees = settlement();
  fees.receipt.logs.unshift(
    event('PerformanceFeeCollected', [42, 1001000, 1000000, 1])
  );
  for (const data of [epoch, supply, time, missing, fees])
    assert.throws(() => verifySettlement(data), /unverified/);
});
