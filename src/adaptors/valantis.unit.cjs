const { test } = require('node:test');
const assert = require('node:assert/strict');
const sdk = require('@defillama/sdk');
const { annualized, escrowClaims, context, readState, createAdapter } = require('./valantis');

test('APY is invariant to proportional deposits and withdrawals', () => {
  const before = { numerator: 100n, denominator: 100n };
  assert.equal(annualized(before, { numerator: 1000n, denominator: 1000n }, 86400), 0);
  assert.equal(annualized(before, { numerator: 10n, denominator: 10n }, 86400), 0);
});
test('APY compounds the actual interval and preserves losses', () => {
  const a = { numerator: 10000n, denominator: 10000n };
  assert.ok(Math.abs(annualized(a, { numerator: 10001n, denominator: 10000n }, 86400) - ((1.0001 ** 365 - 1) * 100)) < 1e-9);
  assert.ok(annualized(a, { numerator: 9999n, denominator: 10000n }, 86400) < 0);
  assert.ok(Math.abs(annualized(a, { numerator: 10001n, denominator: 10000n }, 43200) - ((1.0001 ** 730 - 1) * 100)) < 1e-9);
  assert.throws(() => annualized(a, { numerator: 0n, denominator: 1n }, 86400));
  assert.throws(() => annualized(a, a, 0));
});
test('escrow funding is excluded until release; pending and seed do not earn premium APY', () => {
  assert.deepEqual(escrowClaims(['1000', '100', '300', '500'], '10'),
    { active: 900n, claims: 1200n, custody: 1800n, units: 100n, allActive: 1000n });
  const released = escrowClaims(['1100', '100', '300', '400'], '10');
  assert.equal(released.active, 990n);
  assert.equal(released.custody, 1800n);
  assert.throws(() => escrowClaims(['1', '0', '0', '0'], '0'));
});
test('each product has its own module; no invented registered protocol ID', () => {
  for (const kind of ['sthype', 'sthypeStex', 'khypeStex', 'restaking']) {
    const adapter = createAdapter(kind);
    assert.equal(typeof adapter.apy, 'function');
    assert.equal(adapter.protocolId, undefined);
  }
});

test('archive guard rejects latest-only providers and insufficient deployment history', async (t) => {
  t.mock.getter(sdk, 'getProvider', () => () => ({ getCode: async () => '0xabcd' }));
  await assert.rejects(context(1793000000, { block: 100 }), /requires an archive RPC/);
  t.mock.getter(sdk, 'getProvider', () => () => ({ getCode: async () => '0x' }));
  t.mock.getter(sdk.blocks, 'getBlockNumber', () => async () => 99);
  await assert.rejects(context(1793000000, { block: 100 }), /Insufficient deployed history/);
  await assert.rejects(context('not a timestamp', { block: 100 }), /Invalid Valantis observation timestamp/);
});

test('restaking state prices active users only and previews released premiums, not reward reserves', async () => {
  let accounting = ['1000', '100', '300', '500'];
  const api = { batchCall: async () => [accounting, ['10', '100', '0'], '1800', '1000000000000000000', ['', '', '', '1209600', '82800'], false],
    call: async ({ params }) => params[0] };
  const first = await readState(api, 'restaking');
  assert.equal(first.assets, 900n);
  assert.equal(first.cooldown, 1209600);
  assert.equal(first.index.numerator, 1000n * 10n ** 18n);
  assert.equal(first.index.denominator, 100n);
  accounting = ['1100', '100', '300', '400'];
  const released = await readState(api, 'restaking');
  assert.equal(released.assets, 990n);
  assert.ok(annualized(first.index, released.index, 31536000) > 9.99);
  accounting = ['1000', '100', '300', '501'];
  await assert.rejects(readState(api, 'restaking'), /custody does not reconcile/);
});

test('STEX snapshots bypass the address cache for replaceable withdrawal modules', async () => {
  const api = {
    batchCall: async (calls) => {
      if (calls[0].abi === 'address:pool') {
        assert.equal(calls[1].skipCache, true);
        return ['pool', '0x0000000000000000000000000000000000000010', '1000', true];
      }
      return [['100', '200'], '300', '50', '50', '20'];
    },
    getGasTokenBalance: async () => '100',
    call: async ({ params }) => params ? '150' : '30',
  };
  const state = await readState(api, 'khypeStex', { address: 'stex' });
  assert.equal(state.assets, 650n);
  assert.deepEqual(state.index, { numerator: 650n, denominator: 1000n });
  assert.equal(state.paused, true);
});
