const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getPools } = require('./pools');

const MARKETS = [
  [
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    'USDC',
    6,
    12,
  ],
  ['usdt.tether-token.near', 'USDt', 6, 12],
  [
    'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
    'USDC.e',
    6,
    12,
  ],
  [
    'dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near',
    'USDT.e',
    6,
    12,
  ],
  [
    '6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near',
    'DAI',
    18,
    0,
  ],
  [
    '853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near',
    'FRAX',
    18,
    0,
  ],
];

function asset(tokenId, extraDecimals, overrides = {}) {
  return {
    token_id: tokenId,
    supplied: {
      shares: '100000000000000000000',
      balance: '100000000000000000000',
    },
    borrowed: {
      shares: '80000000000000000000',
      balance: '80000000000000000000',
    },
    margin_debt: { shares: '0', balance: '2000000000000000000' },
    margin_pending_debt: '1000000000000000000',
    margin_position: '0',
    reserved: '20000000000000000000',
    prot_fee: '1000000000000000000',
    beneficiary_fees: {},
    uahpi: '0',
    last_update_timestamp: '1788789710890118778',
    config: {
      reserve_ratio: 2500,
      beneficiaries: {},
      target_utilization: 8000,
      target_utilization_rate: '1',
      max_utilization_rate: '1',
      holding_position_fee_rate: '1',
      volatility_ratio: 9500,
      extra_decimals: extraDecimals,
      can_deposit: true,
      can_withdraw: true,
      can_use_as_collateral: true,
      can_borrow: true,
      net_tvl_multiplier: 10000,
      max_change_rate: null,
      supplied_limit: '0',
      borrowed_limit: '0',
      min_borrowed_amount: '0',
    },
    lostfound_shares: '0',
    supply_apr: '0.06',
    borrow_apr: '0.08',
    farms: [{ farm_id: { TokenNetBalance: tokenId }, rewards: {} }],
    ...overrides,
  };
}

function fixture(overrides = {}) {
  const assets = MARKETS.map(([id, , , extra]) => asset(id, extra));
  const quotes = new Map(
    MARKETS.map(([id, , decimals]) => [
      id,
      { price: 1, decimals, timestamp: 2_000_000, confidence: 0.99 },
    ])
  );
  const calls = [];
  return {
    assets,
    quotes,
    calls,
    client: {
      view: async (...args) => {
        calls.push(['view', ...args]);
        return overrides.assets || assets;
      },
      prices: async (...args) => {
        calls.push(['prices', ...args]);
        return overrides.quotes || quotes;
      },
    },
  };
}

test('getPools returns the exact six allowlisted markets with literal symbols', async () => {
  const f = fixture();
  const rows = await getPools(f.client, () => {});

  assert.equal(rows.length, 6);
  assert.deepEqual(
    rows.map((row) => row.symbol),
    ['USDC', 'USDt', 'USDC.e', 'USDT.e', 'DAI', 'FRAX']
  );
  assert.deepEqual(rows[0], {
    pool: 'rhea-lend-17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1-near',
    chain: 'NEAR',
    project: 'rhea-lend',
    symbol: 'USDC',
    totalSupplyUsd: 121,
    totalBorrowUsd: 83,
    tvlUsd: 38,
    apyBase: 6,
    apyBaseBorrow: 8,
    underlyingTokens: [
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    ],
    token: null,
    url: 'https://app.rhea.finance/tokenDetail/17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1?pageType=main',
  });
  assert.deepEqual(f.calls, [
    [
      'view',
      'contract.main.burrow.near',
      'get_assets',
      { token_ids: MARKETS.map(([id]) => id) },
    ],
    ['prices', MARKETS.map(([id]) => id)],
  ]);
});

test('missing, duplicate and unpriced assets only remove affected markets', async () => {
  const f = fixture();
  const missingId = MARKETS[0][0];
  const duplicateId = MARKETS[1][0];
  const unpricedId = MARKETS[2][0];
  const source = f.assets.filter((item) => item.token_id !== missingId);
  source.push(source.find((item) => item.token_id === duplicateId));
  f.quotes.delete(unpricedId);
  const diagnostics = [];

  const rows = await getPools(
    { view: async () => source, prices: async () => f.quotes },
    (message) => diagnostics.push(message)
  );

  assert.deepEqual(
    rows.map((row) => row.symbol),
    ['USDT.e', 'DAI', 'FRAX']
  );
  assert.equal(diagnostics.length, 3);
});

test('disabled deposits and malformed market accounting skip independently', async () => {
  const f = fixture();
  const source = f.assets.map((item, index) => {
    if (index === 0) {
      return { ...item, config: { ...item.config, can_deposit: false } };
    }
    if (index === 1)
      return { ...item, supplied: { ...item.supplied, balance: null } };
    return item;
  });

  const rows = await getPools(
    { view: async () => source, prices: async () => f.quotes },
    () => {}
  );
  assert.deepEqual(
    rows.map((row) => row.symbol),
    ['USDC.e', 'USDT.e', 'DAI', 'FRAX']
  );
});

test('absent borrow APR omits its field while malformed present APR rejects that market', async () => {
  const f = fixture();
  const source = f.assets.map((item, index) => {
    if (index === 0) {
      const withoutBorrowApr = { ...item };
      delete withoutBorrowApr.borrow_apr;
      return withoutBorrowApr;
    }
    if (index === 1) return { ...item, borrow_apr: null };
    return item;
  });

  const rows = await getPools(
    { view: async () => source, prices: async () => f.quotes },
    () => {}
  );
  assert.equal(rows.length, 5);
  assert.equal('apyBaseBorrow' in rows[0], false);
  assert.equal(
    rows.some((row) => row.symbol === 'USDt'),
    false
  );
});

test('active rewards are reported while the verified base market remains available', async () => {
  const f = fixture();
  const rewarded = {
    ...f.assets[0],
    farms: [
      {
        farm_id: { TokenNetBalance: f.assets[0].token_id },
        rewards: { 'token.rhealab.near': { reward_per_day: '1' } },
      },
    ],
  };
  const diagnostics = [];
  const rows = await getPools(
    {
      view: async () => [rewarded, ...f.assets.slice(1)],
      prices: async () => f.quotes,
    },
    (message) => diagnostics.push(message)
  );

  assert.equal(rows.length, 6);
  assert.equal('apyReward' in rows[0], false);
  assert.match(diagnostics[0], /active rewards omitted/);
});

test('getPools rejects malformed source shape and an all-market failure', async () => {
  const f = fixture();
  await assert.rejects(
    getPools(
      { view: async () => ({}), prices: async () => f.quotes },
      () => {}
    ),
    /Invalid lending assets/
  );
  await assert.rejects(
    getPools({ view: async () => [], prices: async () => f.quotes }, () => {}),
    /No valid RHEA lending markets/
  );
});

test('FRAX uses its actual price and 18 decimals while retaining unboosted supply yield', async () => {
  const f = fixture();
  const id = '853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near';
  const frax = f.assets.find((item) => item.token_id === id);
  frax.supply_apr = '0.1885';
  f.quotes.set(id, { ...f.quotes.get(id), price: 0.992 });

  const rows = await getPools(f.client, () => {});
  const row = rows.find((item) => item.symbol === 'FRAX');
  assert.ok(row, 'FRAX must be returned as a lending market');
  assert.equal(row.totalSupplyUsd, 120.032);
  assert.equal(row.totalBorrowUsd, 82.336);
  assert.equal(row.tvlUsd, 37.696);
  assert.equal(row.apyBase, 18.85);
  assert.deepEqual(row.underlyingTokens, [id]);
  assert.equal('apyReward' in row, false);
});
