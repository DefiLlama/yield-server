const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');
const sdk = require('@defillama/sdk');
const { annualized, escrowClaims, context, readState } = require('./valantis');

const ARCHIVE = 'https://archive.example';
function configureArchive(t, urls = [ARCHIVE]) {
  const keys = ['HYPERLIQUID_WHITELISTED_RPC', 'SDK_HYPERLIQUID_WHITELISTED_RPC', 'LLAMA_SDK_HYPERLIQUID_WHITELISTED_RPC'];
  const previous = keys.map(key => process.env[key]);
  keys.forEach(key => { delete process.env[key]; });
  process.env.HYPERLIQUID_WHITELISTED_RPC = urls.join(',');
  t.after(() => keys.forEach((key, i) => {
    if (previous[i] === undefined) delete process.env[key];
    else process.env[key] = previous[i];
  }));
}
function mockArchiveProvider(t) {
  configureArchive(t);
  return { isCustomLlamaProvider: true, rpcs: [{ url: ARCHIVE, provider: { getCode: async () => '0x' } }], archivalRPCs: [] };
}

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
  const provider = mockArchiveProvider(t);
  provider.getBlock = async (block) => ({ timestamp: block === baseline ? observation - 86400 : observation });
  t.mock.getter(sdk, 'getProvider', () => () => provider);
  t.mock.getter(sdk.blocks, 'getBlockNumber', () => async (_chain, timestamp) => timestamp === observation ? baseline + 1000 : baseline);
  t.mock.getter(sdk, 'ChainApi', () => class {
    constructor({ block }) { this.block = block; this.provider = provider; }
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
  const provider = mockArchiveProvider(t);
  provider.rpcs[0].provider.getCode = async () => '0xabcd';
  t.mock.getter(sdk, 'getProvider', () => () => provider);
  await assert.rejects(context(1793000000, { block: 100 }), /requires an archive RPC/);
  provider.rpcs[0].provider.getCode = async () => '0x';
  t.mock.getter(sdk.blocks, 'getBlockNumber', () => async () => 99);
  await assert.rejects(context(1793000000, { block: 100 }), /Insufficient deployed history/);
  await assert.rejects(context('not a timestamp', { block: 100 }), /Invalid Valantis observation timestamp/);
});

test('archive routing rejects missing configuration and cached public fallbacks before reads', async (t) => {
  configureArchive(t, []);
  let initialized = false;
  const provider = { isCustomLlamaProvider: true, rpcs: [{ url: 'https://public.example', provider: {} }], archivalRPCs: [] };
  t.mock.getter(sdk, 'getProvider', () => () => { initialized = true; return provider; });
  await assert.rejects(context(1793000000, { block: 100 }), /requires HYPERLIQUID_WHITELISTED_RPC/);
  assert.equal(initialized, false);
  process.env.HYPERLIQUID_WHITELISTED_RPC = ARCHIVE;
  await assert.rejects(context(1793000000, { block: 100 }), /cached or unapproved RPC fallback/);
  provider.rpcs = [{ url: ARCHIVE, provider: {} }];
  provider.archivalRPCs = [{ url: 'https://public.example', provider: {} }];
  await assert.rejects(context(1793000000, { block: 100 }), /cached or unapproved RPC fallback/);
});

test('every whitelisted endpoint is probed and SDK-prefixed settings take precedence', async (t) => {
  const second = 'https://secondary.example';
  configureArchive(t, [ARCHIVE]);
  process.env.LLAMA_SDK_HYPERLIQUID_WHITELISTED_RPC = `${ARCHIVE},${second}`;
  const probes = [];
  let unavailable = false;
  const rpcs = [ARCHIVE, second].map(url => ({ url, provider: {
    getCode: async (address, block) => {
      assert.equal(address, '0x0447d0339c82a8efe01994b7d1981bf5c517da0e');
      assert.equal(block, 1);
      probes.push(url);
      if (url === second && unavailable) throw new Error('RPC unavailable');
      return url === ARCHIVE ? '0x' : '0x1234';
    },
  } }));
  const provider = { isCustomLlamaProvider: true, rpcs, archivalRPCs: rpcs };
  t.mock.getter(sdk, 'getProvider', () => () => provider);
  await assert.rejects(context(1793000000, { block: 100 }), /historical code query returned current code/);
  assert.deepEqual(probes, [ARCHIVE, second]);
  unavailable = true;
  await assert.rejects(context(1793000000, { block: 100 }), /could not validate a configured archive RPC/);
});

test('observation state APIs must retain the validated provider identity', async (t) => {
  const provider = mockArchiveProvider(t);
  provider.getBlock = async (block) => ({ timestamp: block });
  t.mock.getter(sdk, 'getProvider', () => () => provider);
  t.mock.getter(sdk.blocks, 'getBlockNumber', () => async (_chain, time) => time);
  t.mock.getter(sdk, 'ChainApi', () => class { constructor() { this.provider = {}; } });
  await assert.rejects(context(1793000000, { block: 100 }), /archive provider changed/);
});

test('real SDK failover uses only approved archive RPCs and fails closed when both are unavailable', async (t) => {
  const observation = 1793000000;
  const requests = [];
  let primaryDown = false;
  let secondaryDown = false;
  async function endpoint(role) {
    const server = http.createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      requests.push({ role, method: payload.method, params: payload.params });
      response.setHeader('content-type', 'application/json');
      if ((role === 'primary' && primaryDown) || (role === 'secondary' && secondaryDown)) {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: 'Archive unavailable' }));
        return;
      }
      let result;
      if (payload.method === 'eth_getCode') result = role === 'latest' ? '0x1234' : '0x';
      else if (payload.method === 'eth_chainId') result = '0x3e7';
      else if (payload.method === 'eth_getBlockByNumber') result = { number: payload.params[0], timestamp: '0x' + (Number(payload.params[0]) === 100 ? observation - 86400 : observation).toString(16) };
      else if (payload.method === 'eth_getBalance') result = '0x15';
      else if (payload.method === 'eth_call') result = '0x' + (role === 'latest' ? '99' : '2a').padStart(64, '0');
      else throw new Error('Unexpected RPC method: ' + payload.method);
      response.end(JSON.stringify({ jsonrpc: '2.0', id: payload.id, result }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    return `http://127.0.0.1:${server.address().port}`;
  }
  const primary = await endpoint('primary');
  const secondary = await endpoint('secondary');
  const latest = await endpoint('latest');
  configureArchive(t, [primary, secondary]);
  const oldSkip = process.env.SKIP_RPC_CHECK;
  process.env.SKIP_RPC_CHECK = 'true';
  const general = require('@defillama/sdk/build/general');
  const oldProvider = general.providers.hyperliquid;
  const oldDefaults = sdk.providerListJSON.hyperliquid.rpc;
  sdk.providerListJSON.hyperliquid.rpc = [latest];
  sdk.setProvider('hyperliquid', undefined);
  let provider;
  t.after(() => {
    provider?.destroy();
    sdk.setProvider('hyperliquid', oldProvider);
    sdk.providerListJSON.hyperliquid.rpc = oldDefaults;
    if (oldSkip === undefined) delete process.env.SKIP_RPC_CHECK;
    else process.env.SKIP_RPC_CHECK = oldSkip;
  });
  t.mock.getter(sdk.blocks, 'getBlockNumber', () => async (_chain, time) => time === observation ? 200 : 100);
  const ctx = await context(observation, { block: 10 });
  provider = ctx.api.provider;
  assert.equal(ctx.fromApi.provider, provider);
  assert.deepEqual(provider.rpcs.map(rpc => rpc.url), [primary, secondary]);
  primaryDown = true;
  const call = { target: '0x00000000000000000000000000000000000000aa', abi: 'uint256:totalSupply', skipCache: true };
  assert.equal(await ctx.api.call(call), '42');
  assert.equal(await ctx.fromApi.call(call), '42');
  assert.equal(await ctx.api.getGasTokenBalance('0x00000000000000000000000000000000000000bb'), '21');
  assert.ok(requests.some(request => request.role === 'secondary' && request.method === 'eth_call' && request.params[1] === '0x64'));
  assert.ok(requests.some(request => request.role === 'secondary' && request.method === 'eth_call' && request.params[1] === '0xc8'));
  secondaryDown = true;
  await assert.rejects(ctx.api.call({ ...call, target: '0x00000000000000000000000000000000000000cc' }));
  assert.equal(requests.filter(request => request.role === 'latest').length, 0);
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

test('original STEX module uses its legacy pending-withdrawal getter when native surplus exists', async () => {
  const original = '0x40ba056b004edd0b572509a1276fd8530cf2bb7f';
  const calls = [];
  const api = {
    batchCall: async (batch) => batch[0].abi === 'address:pool'
      ? ['pool', original, '1000', false] : [['100', '200'], '300', '50', '50', '20'],
    getGasTokenBalance: async () => '100',
    call: async ({ abi, params }) => {
      calls.push(abi);
      if (params) {
        assert.equal(abi, 'function convertToToken1(uint256) view returns (uint256)');
        assert.deepEqual(params, ['150']);
        return '150';
      }
      assert.equal(abi, 'uint256:_amountToken1PendingLPWithdrawal');
      return '30';
    },
  };
  const state = await readState(api, 'sthypeStex', { address: 'stex' });
  assert.equal(state.assets, 650n);
  assert.deepEqual(state.index, { numerator: 650n, denominator: 1000n });
  assert.equal(calls[0], 'uint256:_amountToken1PendingLPWithdrawal');
});

test('restaking output explicitly opts out of receipt-token inference with token null', async (t) => {
  const observation = 1793000000;
  const provider = mockArchiveProvider(t);
  provider.getBlock = async (block) => ({ timestamp: block === 48000000 ? observation - 86400 : observation });
  t.mock.getter(sdk, 'getProvider', () => () => provider);
  t.mock.getter(sdk.blocks, 'getBlockNumber', () => async (_chain, time) => time === observation ? 48001000 : 48000000);
  t.mock.getter(sdk, 'ChainApi', () => class {
    constructor({ block }) { this.block = block; this.provider = provider; }
    async batchCall() { return [['1000', '100', '300', '500'], ['10', '100', '0'], '1800', '1000000000000000000', ['', '', '', '1209600', '82800'], false]; }
    async call({ params }) { return params[0]; }
  });
  t.mock.method(require('./utils'), 'getPriceApiData', async () => ({ coins: { 'hyperliquid:0x5555555555555555555555555555555555555555': { price: 80 } } }));
  const paths = [require.resolve('./valantis'), require.resolve('./valantis-sthype-restaking')];
  const previous = paths.map(path => require.cache[path]);
  paths.forEach(path => { delete require.cache[path]; });
  t.after(() => paths.forEach((path, i) => {
    if (previous[i]) require.cache[path] = previous[i];
    else delete require.cache[path];
  }));
  const rows = await require('./valantis-sthype-restaking').apy(observation);
  assert.equal(rows.length, 1);
  assert.strictEqual(rows[0].token, null);
  assert.equal(rows[0].project, 'valantis-sthype-restaking');
  assert.equal(rows[0].apyBase, 0);
  assert.equal(rows[0].apyReward, undefined);
});

test('archive whitelist reaches trusted deployment and Lambda without exposing secrets to PR CI', () => {
  const root = `${__dirname}/../..`;
  assert.match(fs.readFileSync(`${root}/.github/workflows/master.yml`, 'utf8'), /HYPERLIQUID_WHITELISTED_RPC:.*secrets\.HYPERLIQUID_WHITELISTED_RPC/);
  assert.doesNotMatch(fs.readFileSync(`${root}/.github/workflows/test.yml`, 'utf8'), /secrets\.HYPERLIQUID/);
  assert.match(fs.readFileSync(`${root}/env.js`, 'utf8'), /HYPERLIQUID_WHITELISTED_RPC: process\.env\.HYPERLIQUID_WHITELISTED_RPC \|\| process\.env\.HYPERLIQUID_RPC/);
  assert.match(fs.readFileSync(`${root}/serverless.yml`, 'utf8'), /HYPERLIQUID_WHITELISTED_RPC: \$\{file\(\.\/env\.js\):HYPERLIQUID_WHITELISTED_RPC\}/);
  const source = fs.readFileSync(`${root}/env.js`, 'utf8');
  for (const [env, expected] of [
    [{ HYPERLIQUID_WHITELISTED_RPC: ARCHIVE, HYPERLIQUID_RPC: 'https://primary.example' }, ARCHIVE],
    [{ HYPERLIQUID_RPC: ARCHIVE }, ARCHIVE],
    [{}, ''],
  ]) {
    // Evaluate the deployment mapping without reading config.env or real secrets.
    const sandbox = { module: { exports: {} }, process: { env }, require: () => ({ config: () => {} }) };
    vm.runInNewContext(source, sandbox);
    assert.equal(sandbox.module.exports.HYPERLIQUID_WHITELISTED_RPC, expected);
  }
});
