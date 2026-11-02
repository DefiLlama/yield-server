const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sdk = require('@defillama/sdk');
const { annualized, escrowClaims, context, readState } = require('./valantis');

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
test('three registered products export their assigned literal protocol IDs', () => {
  for (const [slug, id] of [['sthype', '6457'], ['valantis-stex', '5987'], ['valantis-sthype-restaking', '9281']]) {
    const path = require.resolve(`./${slug}`);
    const adapter = require(path);
    assert.equal(typeof adapter.apy, 'function');
    assert.equal(adapter.protocolId, id);
    assert.match(fs.readFileSync(path, 'utf8'), new RegExp(`module\\.exports\\s*=\\s*\\{[\\s\\S]*?protocolId:\\s*'${id}'`));
  }
});

test('combined STEX wrapper requests both pool kinds under one registered identity', async (t) => {
  const helper = require('./valantis');
  const calls = [];
  t.mock.method(helper, 'createAdapter', (kinds) => ({
    url: 'https://app.valantis.xyz/vaults',
    apy: async (timestamp) => {
      calls.push([kinds, timestamp]);
      return kinds.map(kind => ({ pool: kind, project: 'valantis-stex' }));
    },
  }));
  const path = require.resolve('./valantis-stex');
  delete require.cache[path];
  t.after(() => { delete require.cache[path]; });
  const adapter = require(path);
  assert.deepEqual(await adapter.apy(1793000000), [
    { pool: 'sthypeStex', project: 'valantis-stex' },
    { pool: 'khypeStex', project: 'valantis-stex' },
  ]);
  assert.deepEqual(calls, [[['sthypeStex', 'khypeStex'], 1793000000]]);
});

test('combined STEX uses one window, skips undeployed pools and rejects missing deployed state', async (t) => {
  let baseline = 2000000;
  let fail = false;
  const queries = [];
  const observation = 1793000000;
  const sthype = '0x39694eff3b02248929120c73f90347013aec834d';
  const khype = '0xbf747d2959f03332dbd25249db6f00f62c6cb526';
  t.mock.getter(sdk, 'getProvider', () => () => ({
    getCode: async () => '0x',
    getBlock: async (block) => ({ timestamp: block === baseline ? observation - 86400 : observation }),
  }));
  t.mock.getter(sdk.blocks, 'getBlockNumber', () => async (_chain, timestamp) => timestamp === observation ? baseline + 1000 : baseline);
  t.mock.getter(sdk, 'ChainApi', () => class {
    constructor({ block }) { this.block = block; }
    async batchCall(calls) {
      if (calls[0].abi === 'address:pool') {
        queries.push([calls[0].target, this.block]);
        if (fail && calls[0].target === khype) throw new Error('Missing kHYPE state');
        return ['pool', 'module', '1000', calls[0].target === khype];
      }
      return [['100', '200'], '300', '50', '50', '20'];
    }
    async getGasTokenBalance() { return '100'; }
    async call({ params }) { return params ? '150' : '30'; }
  });
  const utils = require('./utils');
  t.mock.method(utils, 'getPriceApiData', async () => ({ coins: { 'hyperliquid:0x5555555555555555555555555555555555555555': { price: 80 } } }));
  const path = require.resolve('./valantis');
  const cached = require.cache[path];
  delete require.cache[path];
  t.after(() => { require.cache[path] = cached; });
  const adapter = require(path).createAdapter(['sthypeStex', 'khypeStex']);
  const early = await adapter.apy(observation);
  assert.deepEqual(early.map(pool => pool.pool), [`${sthype}-hyperliquid`]);
  assert.deepEqual(queries, [[sthype, 2001000], [sthype, 2000000]]);
  baseline = 10000000;
  queries.length = 0;
  const current = await adapter.apy(observation);
  assert.deepEqual(current.map(pool => pool.project), ['valantis-stex', 'valantis-stex']);
  assert.match(current[1].poolMeta, /Withdrawal-only/);
  assert.deepEqual(queries, [[sthype, 10001000], [sthype, 10000000], [khype, 10001000], [khype, 10000000]]);
  fail = true;
  await assert.rejects(adapter.apy(observation), /Missing kHYPE state/);
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
  let custody = '1800';
  const api = { batchCall: async () => [accounting, ['10', '100', '0'], custody, '1000000000000000000', ['', '', '', '1209600', '82800'], false],
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
  accounting = ['1000', '100', '300', '500'];
  custody = '1801';
  const extraBacking = await readState(api, 'restaking');
  assert.equal(extraBacking.assets, first.assets);
  assert.deepEqual(extraBacking.index, first.index);
  custody = '1799';
  await assert.rejects(readState(api, 'restaking'), /custody does not reconcile/);
  accounting = ['1100', '100', '300', '500'];
  custody = '1900';
  assert.equal((await readState(api, 'restaking')).assets, 990n);
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
