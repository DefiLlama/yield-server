const { test } = require('node:test');
const assert = require('node:assert/strict');
const { xrheaSnapshot, rnearSnapshot, nearApy } = require('./data');

const BLOCK_HEIGHT = 214678755;

const xMetadata = {
  locked_token_id: 'token.rhealab.near',
  locked_token_amount: '2000000000000000000',
  cur_locked_token_amount: '2000000000000000000',
  reward_per_sec: '1',
  undistributed_reward_amount: '100',
  cur_undistributed_reward_amount: '100',
};

const xTokenMetadata = {
  spec: 'ft-1.0.0',
  name: 'xRhea',
  symbol: 'XRHEA',
  decimals: 18,
};

const rSummary = {
  total_share_amount: '3000000000000000000000000',
  total_staked_near_amount: '3000000000000000000000000',
  ft_price: '1000000000000000000000000',
};

const rTokenMetadata = {
  spec: 'ft-1.0.0',
  name: 'Rhea Liquid Near Staking Token',
  symbol: 'rNEAR',
  decimals: 24,
};

function responses(overrides = {}) {
  return {
    'xtoken.rhealab.near/contract_metadata': xMetadata,
    'xtoken.rhealab.near/ft_total_supply': '2000000000000000000',
    'xtoken.rhealab.near/get_virtual_price': '100000000',
    'xtoken.rhealab.near/ft_metadata': xTokenMetadata,
    'xtoken.rhealab.near/get_exit_fee_bps': { 0: 1000, 30: 0 },
    'lst.rhealab.near/get_summary': rSummary,
    'lst.rhealab.near/ft_total_supply': '3000000000000000000000000',
    'lst.rhealab.near/ft_metadata': rTokenMetadata,
    ...overrides,
  };
}

function viewClient(values = responses()) {
  const calls = [];
  return {
    calls,
    view: async (contract, method, args, blockHeight) => {
      calls.push({ contract, method, args, blockHeight });
      const key = `${contract}/${method}`;
      if (!(key in values)) throw new Error(`missing fixture ${key}`);
      return values[key];
    },
  };
}

test('staking snapshots read all eight views at the supplied final block', async () => {
  const client = viewClient();
  const [xrhea, rnear] = await Promise.all([
    xrheaSnapshot(BLOCK_HEIGHT, client),
    rnearSnapshot(BLOCK_HEIGHT, client),
  ]);

  assert.deepEqual(xrhea, {
    metadata: xMetadata,
    supply: '2000000000000000000',
    virtualPrice: '100000000',
    tokenMetadata: xTokenMetadata,
    exitFees: { 0: 1000, 30: 0 },
  });
  assert.deepEqual(rnear, {
    summary: rSummary,
    supply: '3000000000000000000000000',
    tokenMetadata: rTokenMetadata,
  });
  assert.equal(client.calls.length, 8);
  assert.ok(client.calls.every((call) => call.blockHeight === BLOCK_HEIGHT));
  assert.ok(client.calls.every((call) => Object.keys(call.args).length === 0));
  assert.deepEqual(
    client.calls.map(({ contract, method }) => `${contract}/${method}`).sort(),
    Object.keys(responses()).sort()
  );
});

test('xRHEA rejects malformed state, broken conservation and bad fees', async () => {
  const missingReward = viewClient(
    responses({
      'xtoken.rhealab.near/contract_metadata': {
        ...xMetadata,
        cur_undistributed_reward_amount: undefined,
      },
    })
  );
  await assert.rejects(
    xrheaSnapshot(BLOCK_HEIGHT, missingReward),
    /cur_undistributed_reward_amount/
  );

  const brokenConservation = viewClient(
    responses({
      'xtoken.rhealab.near/contract_metadata': {
        ...xMetadata,
        cur_undistributed_reward_amount: '99',
      },
    })
  );
  await assert.rejects(
    xrheaSnapshot(BLOCK_HEIGHT, brokenConservation),
    /conservation/
  );

  const badFees = viewClient(
    responses({ 'xtoken.rhealab.near/get_exit_fee_bps': { 0: '1000' } })
  );
  await assert.rejects(xrheaSnapshot(BLOCK_HEIGHT, badFees), /exit fee/);
});

test('xRHEA validates receipt metadata and its raw share identity', async () => {
  const badDecimals = viewClient(
    responses({
      'xtoken.rhealab.near/ft_metadata': { ...xTokenMetadata, decimals: 24 },
    })
  );
  await assert.rejects(xrheaSnapshot(BLOCK_HEIGHT, badDecimals), /decimals/);

  const wrongUnderlying = viewClient(
    responses({
      'xtoken.rhealab.near/contract_metadata': {
        ...xMetadata,
        locked_token_id: 'other.near',
      },
    })
  );
  await assert.rejects(
    xrheaSnapshot(BLOCK_HEIGHT, wrongUnderlying),
    /locked token/
  );

  const brokenIdentity = viewClient(
    responses({ 'xtoken.rhealab.near/get_virtual_price': '200000000' })
  );
  await assert.rejects(xrheaSnapshot(BLOCK_HEIGHT, brokenIdentity), /identity/);
});

test('rNEAR validates metadata, supply equality and raw share identity', async () => {
  const badDecimals = viewClient(
    responses({
      'lst.rhealab.near/ft_metadata': { ...rTokenMetadata, decimals: 18 },
    })
  );
  await assert.rejects(rnearSnapshot(BLOCK_HEIGHT, badDecimals), /decimals/);

  const supplyMismatch = viewClient(
    responses({
      'lst.rhealab.near/ft_total_supply': '2999999999999999999999999',
    })
  );
  await assert.rejects(rnearSnapshot(BLOCK_HEIGHT, supplyMismatch), /supply/);

  const brokenIdentity = viewClient(
    responses({
      'lst.rhealab.near/get_summary': {
        ...rSummary,
        ft_price: '2000000000000000000000000',
      },
    })
  );
  await assert.rejects(rnearSnapshot(BLOCK_HEIGHT, brokenIdentity), /identity/);
});

test('NEAR APY accepts a finite non-negative percentage and converts once', async () => {
  const calls = [];
  const client = {
    getJson: async (...args) => {
      calls.push(args);
      return { code: 0, data: '4.177538', msg: 'success' };
    },
  };

  assert.equal(await nearApy(client), 4.177538);
  assert.deepEqual(calls, [['https://api.rhea.finance/get-rnear-apy']]);
});

test('NEAR APY rejects unverified codes and malformed percentages', async () => {
  for (const body of [
    { code: '0', data: '4.1' },
    { code: 1, data: '4.1' },
    { code: 0, data: '' },
    { code: 0, data: true },
    { code: 0, data: '-1' },
    { code: 0, data: 'Infinity' },
  ]) {
    await assert.rejects(nearApy({ getJson: async () => body }), /NEAR APY/);
  }
});
