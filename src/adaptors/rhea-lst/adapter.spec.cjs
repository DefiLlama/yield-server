const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getPools } = require('./pools');
const adapter = require('./index');

const BLOCK_HEIGHT = 214678755;

function responses(overrides = {}) {
  return {
    'xtoken.rhealab.near/contract_metadata': {
      locked_token_id: 'token.rhealab.near',
      locked_token_amount: '2000000000000000000',
      cur_locked_token_amount: '2000000000000000000',
      reward_per_sec: '1',
      undistributed_reward_amount: '100',
      cur_undistributed_reward_amount: '100',
    },
    'xtoken.rhealab.near/ft_total_supply': '2000000000000000000',
    'xtoken.rhealab.near/get_virtual_price': '100000000',
    'xtoken.rhealab.near/ft_metadata': {
      spec: 'ft-1.0.0',
      name: 'xRhea',
      symbol: 'XRHEA',
      decimals: 18,
    },
    'xtoken.rhealab.near/get_exit_fee_bps': { 0: 1000, 30: 0 },
    'lst.rhealab.near/get_summary': {
      total_share_amount: '3000000000000000000000000',
      total_staked_near_amount: '3000000000000000000000000',
      ft_price: '1000000000000000000000000',
    },
    'lst.rhealab.near/ft_total_supply': '3000000000000000000000000',
    'lst.rhealab.near/ft_metadata': {
      spec: 'ft-1.0.0',
      name: 'Rhea Liquid Near Staking Token',
      symbol: 'rNEAR',
      decimals: 24,
    },
    ...overrides,
  };
}

function client(options = {}) {
  const values = responses(options.responses);
  const calls = { finalBlock: 0, prices: [], views: [], getJson: 0 };
  const diagnostics = [];
  const quotes =
    options.quotes ||
    new Map([
      ['token.rhealab.near', { price: 0.02 }],
      ['wrap.near', { price: 2.4 }],
    ]);

  return {
    calls,
    diagnostics,
    finalBlock: async () => {
      calls.finalBlock += 1;
      if (options.finalBlockError) throw options.finalBlockError;
      return { height: BLOCK_HEIGHT, timestamp: 1788794352.6970143 };
    },
    prices: async (ids) => {
      calls.prices.push(ids);
      if (options.priceError) throw options.priceError;
      return quotes;
    },
    view: async (contract, method, args, blockHeight) => {
      calls.views.push({ contract, method, args, blockHeight });
      const key = `${contract}/${method}`;
      if (options.viewError === key) throw new Error(`failed ${key}`);
      return values[key];
    },
    getJson: async () => {
      calls.getJson += 1;
      if (options.apyError) throw options.apyError;
      return options.apyBody || { code: 0, data: '4.2', msg: 'success' };
    },
    diagnostic: (message) => diagnostics.push(message),
  };
}

test('adapter emits two exact pools from one block and underlying quotes', async () => {
  const c = client({
    responses: {
      'xtoken.rhealab.near/get_exit_fee_bps': { 0: 1250, 30: 0 },
    },
  });

  assert.deepEqual(await getPools(c), [
    {
      pool: 'rhea-lst-xtoken.rhealab.near-near',
      chain: 'NEAR',
      project: 'rhea-lst',
      symbol: 'XRHEA',
      token: 'xtoken.rhealab.near',
      underlyingTokens: ['token.rhealab.near'],
      tvlUsd: 0.04,
      apy: 1.5768e-9,
      pricePerShare: 1,
      poolMeta:
        'RHEA staking; current reward annualization before position-dependent exit fees; cooldown earns no yield; exit fees: 0d 12.5%, 30d 0%',
      url: 'https://app.rhea.finance/stake',
    },
    {
      pool: 'rhea-lst-lst.rhealab.near-near',
      chain: 'NEAR',
      project: 'rhea-lst',
      symbol: 'rNEAR',
      token: 'lst.rhealab.near',
      underlyingTokens: ['wrap.near'],
      tvlUsd: 7.2,
      apy: 4.2,
      pricePerShare: 1,
      isIntrinsicSource: true,
      poolMeta:
        'NEAR liquid staking; APY source window and netting are unverified',
      url: 'https://app.rhea.finance/stake',
    },
  ]);
  assert.equal(c.calls.finalBlock, 1);
  assert.deepEqual(c.calls.prices, [['token.rhealab.near', 'wrap.near']]);
  assert.equal(c.calls.views.length, 8);
  assert.ok(c.calls.views.every((call) => call.blockHeight === BLOCK_HEIGHT));
  assert.equal(c.calls.getJson, 1);
});

test('xRHEA failure keeps rNEAR and NEAR APY failure keeps xRHEA', async () => {
  const xFailed = client({
    viewError: 'xtoken.rhealab.near/contract_metadata',
  });
  const afterXFailure = await getPools(xFailed);
  assert.deepEqual(
    afterXFailure.map((pool) => pool.symbol),
    ['rNEAR']
  );
  assert.match(xFailed.diagnostics[0], /xRHEA.*contract_metadata/);

  const nearApyFailed = client({ apyError: new Error('API unavailable') });
  const afterNearFailure = await getPools(nearApyFailed);
  assert.deepEqual(
    afterNearFailure.map((pool) => pool.symbol),
    ['XRHEA']
  );
  assert.match(nearApyFailed.diagnostics[0], /rNEAR.*API unavailable/);
});

test('a missing underlying quote removes only its corresponding product', async () => {
  const onlyRhea = client({
    quotes: new Map([['token.rhealab.near', { price: 0.02 }]]),
  });
  assert.deepEqual(
    (await getPools(onlyRhea)).map((pool) => pool.symbol),
    ['XRHEA']
  );

  const onlyNear = client({
    quotes: new Map([['wrap.near', { price: 2.4 }]]),
  });
  assert.deepEqual(
    (await getPools(onlyNear)).map((pool) => pool.symbol),
    ['rNEAR']
  );
});

test('reward exhaustion is a true zero while missing reward data drops xRHEA', async () => {
  const exhausted = client({
    responses: {
      'xtoken.rhealab.near/contract_metadata': {
        ...responses()['xtoken.rhealab.near/contract_metadata'],
        undistributed_reward_amount: '0',
        cur_undistributed_reward_amount: '0',
      },
    },
  });
  const xPool = (await getPools(exhausted)).find(
    (pool) => pool.symbol === 'XRHEA'
  );
  assert.equal(xPool.apy, 0);

  const missing = client({
    responses: {
      'xtoken.rhealab.near/contract_metadata': {
        ...responses()['xtoken.rhealab.near/contract_metadata'],
        cur_undistributed_reward_amount: undefined,
      },
    },
  });
  assert.deepEqual(
    (await getPools(missing)).map((pool) => pool.symbol),
    ['rNEAR']
  );
});

test('global dependencies and zero usable products reject instead of defaulting', async () => {
  await assert.rejects(
    getPools(client({ finalBlockError: new Error('block unavailable') })),
    /block unavailable/
  );
  await assert.rejects(
    getPools(client({ priceError: new Error('prices unavailable') })),
    /prices unavailable/
  );
  await assert.rejects(
    getPools(client({ quotes: new Map() })),
    /No usable RHEA staking pools/
  );
});

test('index exports the literal protocol identity and production entrypoint', () => {
  assert.equal(adapter.protocolId, '6985');
  assert.equal(adapter.timetravel, false);
  assert.equal(typeof adapter.apy, 'function');
});
