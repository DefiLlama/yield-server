const { test } = require('node:test');
const assert = require('node:assert/strict');

const USDT_E = 'dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near';
const USDC_E = 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near';
const FRAX = '853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near';
const USDT = 'usdt.tether-token.near';
const USDC = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';

const BLOCK = { height: 123456789, timestamp: 1700000000 };
const TOKEN_ORDER = [FRAX, USDC, USDT, USDT_E, USDC_E];

const BASE_POOLS = {
  4514: {
    // Reverse the configured order to verify mixed decimals and quote alignment.
    token_account_ids: [USDC, FRAX],
    amounts: ['600000000', '400000000000000000000'],
  },
  4179: {
    token_account_ids: [USDT, USDC, USDT_E, USDC_E],
    amounts: ['250000000', '250000000', '250000000', '250000000'],
  },
};

const BASE_INDEX_ROWS = ['4514', '4179'].map((id, index) => ({
  id,
  tvl: '1000',
  fee_volume_24h: '10',
  volume_24h: String(100 + index),
  total_fee: '0.0002',
}));

const BASE_QUOTES = new Map(
  TOKEN_ORDER.map((id) => [
    id,
    {
      price: 1,
      decimals: id === FRAX ? 18 : 6,
      timestamp: 1699999900,
      confidence: 0.99,
    },
  ])
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixture(overrides = {}) {
  const calls = { finalBlock: 0, getJson: [], prices: [], view: [] };
  const chainPools = overrides.chainPools || clone(BASE_POOLS);
  const indexRows = overrides.indexRows || clone(BASE_INDEX_ROWS);
  const quotes = overrides.quotes || new Map(BASE_QUOTES);
  const failedPoolIds = new Set(overrides.failedPoolIds || []);

  return {
    calls,
    client: {
      async finalBlock() {
        calls.finalBlock += 1;
        return BLOCK;
      },
      async getJson(url, params) {
        calls.getJson.push({ url, params });
        return (
          overrides.indexResponse || {
            code: 0,
            data: { list: indexRows, total: indexRows.length },
          }
        );
      },
      async prices(ids) {
        calls.prices.push(ids);
        return quotes;
      },
      async view(contract, method, args, blockHeight) {
        calls.view.push({ contract, method, args, blockHeight });
        if (failedPoolIds.has(args.pool_id)) throw new Error('RPC unavailable');
        return clone(chainPools[args.pool_id]);
      },
    },
  };
}

test('exposes a pool collector for dependency-injected adapter tests', () => {
  const { getPools } = require('./pools');

  assert.equal(typeof getPools, 'function');
});

test('exports only the production adapter contract', () => {
  const adapter = require('./index');

  assert.deepEqual(Object.keys(adapter), ['protocolId', 'timetravel', 'apy']);
  assert.equal(adapter.protocolId, '541');
  assert.equal(adapter.timetravel, false);
  assert.equal(typeof adapter.apy, 'function');
});

test('returns only the two selected pools from one final block and annualizes LP fees once', async () => {
  const { getPools } = require('./pools');
  const { client, calls } = fixture();

  const pools = await getPools(client);

  assert.deepEqual(pools, [
    {
      pool: 'rhea-dex-v2.ref-finance.near-4514-near',
      chain: 'NEAR',
      project: 'rhea-dex',
      symbol: 'USDC-FRAX',
      tvlUsd: 1000,
      apyBase: 365,
      underlyingTokens: [USDC, FRAX],
      token: null,
      volumeUsd1d: 100,
      url: 'https://app.rhea.finance/sauce/4514',
    },
    {
      pool: 'rhea-dex-v2.ref-finance.near-4179-near',
      chain: 'NEAR',
      project: 'rhea-dex',
      symbol: 'USDt-USDC-USDT.e-USDC.e',
      tvlUsd: 1000,
      apyBase: 365,
      underlyingTokens: [USDT, USDC, USDT_E, USDC_E],
      token: null,
      volumeUsd1d: 101,
      url: 'https://app.rhea.finance/sauce/4179',
    },
  ]);
  assert.equal(calls.finalBlock, 1);
  assert.deepEqual(calls.getJson, [
    {
      url: 'https://api.rhea.finance/pool/search',
      params: { pool_id_list: '4514,4179' },
    },
  ]);
  assert.deepEqual(calls.prices, [TOKEN_ORDER]);
  assert.deepEqual(
    calls.view,
    [4514, 4179].map((poolId) => ({
      contract: 'v2.ref-finance.near',
      method: 'get_pool',
      args: { pool_id: poolId },
      blockHeight: BLOCK.height,
    }))
  );
});

test('rejects mismatched or duplicate chain token compositions per pool', async () => {
  const { getPools } = require('./pools');
  const chainPools = clone(BASE_POOLS);
  for (const tokens of [
    [USDC, USDT],
    [FRAX, FRAX],
  ]) {
    chainPools[4514].token_account_ids = tokens;
    const pools = await getPools(fixture({ chainPools }).client);
    assert.deepEqual(
      pools.map((pool) => pool.pool),
      ['rhea-dex-v2.ref-finance.near-4179-near']
    );
  }
});

test('drops only pools whose chain tokens have no valid quote', async () => {
  const { getPools } = require('./pools');
  const quotes = new Map(BASE_QUOTES);
  quotes.delete(FRAX);

  const pools = await getPools(fixture({ quotes }).client);

  assert.deepEqual(
    pools.map((pool) => pool.pool),
    ['rhea-dex-v2.ref-finance.near-4179-near']
  );
});

test('does not turn absent or malformed fees into zero APY, but accepts an explicit zero fee', async () => {
  const { getPools } = require('./pools');
  const indexRows = clone(BASE_INDEX_ROWS);
  indexRows[1].fee_volume_24h = '0';
  for (const invalidFee of [undefined, 'not-a-number', '-1']) {
    indexRows[0].fee_volume_24h = invalidFee;
    const pools = await getPools(fixture({ indexRows }).client);
    assert.deepEqual(
      pools.map(({ pool, apyBase }) => ({ pool, apyBase })),
      [{ pool: 'rhea-dex-v2.ref-finance.near-4179-near', apyBase: 0 }]
    );
  }
});

test('isolates duplicate, missing and nonpositive indexer candidate rows', async () => {
  const { getPools } = require('./pools');
  for (const indexRows of [
    [...clone(BASE_INDEX_ROWS), clone(BASE_INDEX_ROWS[0])],
    [clone(BASE_INDEX_ROWS[1])],
    [{ ...BASE_INDEX_ROWS[0], tvl: '0' }, clone(BASE_INDEX_ROWS[1])],
  ]) {
    const pools = await getPools(fixture({ indexRows }).client);
    assert.deepEqual(
      pools.map((pool) => pool.pool),
      ['rhea-dex-v2.ref-finance.near-4179-near']
    );
  }
});

test('skips a pool above the one-percent TVL guard and records comparable inputs', async () => {
  const { getPools } = require('./pools');
  const indexRows = clone(BASE_INDEX_ROWS);
  indexRows[0].tvl = '1010.01';
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  try {
    const pools = await getPools(fixture({ indexRows }).client);

    assert.equal(
      pools.some((pool) => pool.pool.endsWith('-4514-near')),
      false
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], 'RHEA DEX TVL mismatch');
  assert.deepEqual(warnings[0][1], {
    poolId: '4514',
    blockHeight: BLOCK.height,
    blockTimestamp: BLOCK.timestamp,
    chainAmounts: BASE_POOLS[4514].amounts,
    quotes: [
      { tokenId: USDC, price: 1, decimals: 6 },
      { tokenId: FRAX, price: 1, decimals: 18 },
    ],
    chainTvlUsd: 1000,
    indexerTvlUsd: 1010.01,
    feeSource: {
      endpoint: 'https://api.rhea.finance/pool/search',
      feeVolumeUsd24h: '10',
      volumeUsd24h: '100',
    },
  });
});

test('omits zero and invalid 24-hour volume values', async () => {
  const { getPools } = require('./pools');
  for (const invalidVolume of ['0', undefined, '-1', 'not-a-number']) {
    const indexRows = BASE_INDEX_ROWS.map((row) => ({
      ...row,
      volume_24h: invalidVolume,
    }));
    const pools = await getPools(fixture({ indexRows }).client);
    assert.equal(pools.length, 2);
    assert.equal(
      pools.every((pool) => !Object.hasOwn(pool, 'volumeUsd1d')),
      true
    );
  }
});

test('keeps unaffected pools when one RPC fails and rejects when every pool fails', async () => {
  const { getPools } = require('./pools');

  const partial = await getPools(fixture({ failedPoolIds: [4514] }).client);
  assert.deepEqual(
    partial.map((pool) => pool.pool),
    ['rhea-dex-v2.ref-finance.near-4179-near']
  );

  await assert.rejects(
    getPools(fixture({ failedPoolIds: [4514, 4179] }).client),
    /No valid RHEA DEX pools/
  );
});

test('rejects an unusable filtered-index response instead of widening discovery', async () => {
  const { getPools } = require('./pools');
  const { client } = fixture({
    indexResponse: { code: 1, data: { list: BASE_INDEX_ROWS } },
  });

  await assert.rejects(getPools(client), /Invalid RHEA pool search response/);
});
