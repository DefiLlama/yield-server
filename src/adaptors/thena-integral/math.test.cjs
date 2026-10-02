const { test } = require('node:test');
const assert = require('node:assert/strict');
const { feeApr, rewardApr, latestFarmings } = require('./math');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10);
const YEAR = 31536000;
const pool = {
  feesUSD: '1100',
  communityFee0: '125',
  communityFee1: '125',
  createdAtTimestamp: '0',
};
const prior = { feesUSD: '1000', communityFee0: '125', communityFee1: '125' };
const farm = {
  virtualPool: '0xabc',
  incentive: '0xabc',
  isDeactivated: false,
  deactivated: false,
  rates: ['1000000', '0'],
  reserves: ['1000000000', '0'],
  prevTimestamp: '900',
  liquidity: '100',
  rewardToken: 'reward',
  bonusRewardToken: 'bonus',
};
const price = (t) => (t === 'reward' ? { price: 2, decimals: 6 } : null);
test('deducts community share and annualizes 24-hour realized fees', () =>
  near(feeApr(pool, prior, 100000, 86400, 0), 31.9375));
test('farming community fee of 100% yields no LP trading fees', () =>
  near(
    feeApr(
      { ...pool, communityFee0: '1000', communityFee1: '1000' },
      prior,
      100000,
      86400,
      0
    ),
    0
  ));
test('uses conservative larger directional/observed community share', () =>
  near(
    feeApr({ ...pool, communityFee1: '250' }, prior, 100000, 86400, 0),
    27.375
  ));
test('counter resets and missing old history remain unknown', () => {
  assert.equal(
    feeApr({ ...pool, feesUSD: '900' }, prior, 100000, 86400, 0),
    undefined
  );
  assert.equal(feeApr(pool, undefined, 100000, 86400, 100), undefined);
});
test('new pools use only actual fees across the full 24-hour window', () =>
  near(
    feeApr(
      { ...pool, createdAtTimestamp: '101', feesUSD: '100' },
      undefined,
      100000,
      86400,
      100
    ),
    31.9375
  ));
test('uses token decimals and pool-wide reward denominator', () =>
  assert.deepEqual(rewardApr(farm, 1000, 100000, price), {
    apr: ((2 * YEAR) / 100000) * 100,
    tokens: ['reward'],
  }));
test('expired lazy reserves cannot generate phantom APR', () =>
  assert.deepEqual(
    rewardApr({ ...farm, reserves: ['100000000', '0'] }, 1000, 100000, price),
    { apr: 0, tokens: [] }
  ));
test('deactivated or disconnected farm reports zero', () => {
  assert.equal(
    rewardApr({ ...farm, deactivated: true }, 1000, 100000, price).apr,
    0
  );
  assert.equal(
    rewardApr({ ...farm, incentive: '0xdef' }, 1000, 100000, price).apr,
    0
  );
});
test('failed reads and missing reward prices remain unknown', () => {
  assert.equal(
    rewardApr({ ...farm, rates: null }, 1000, 100000, price),
    undefined
  );
  assert.equal(
    rewardApr(farm, 1000, 100000, () => null),
    undefined
  );
});
test('zero active liquidity does not consume reserves', () =>
  assert.ok(
    rewardApr(
      { ...farm, liquidity: '0', reserves: ['1', '0'] },
      1000,
      100000,
      price
    ).apr > 0
  ));
test('latest nonce wins even if it is deactivated', () => {
  const f = [
    { pool: 'x', nonce: '9' },
    { pool: 'x', nonce: '10', isDeactivated: true },
  ];
  assert.deepEqual(latestFarmings(f).get('x'), f[1]);
});

test('null fees and community shares are unknown, not zero', () => {
  assert.equal(
    feeApr({ ...pool, feesUSD: null }, prior, 100000, 86400, 0),
    undefined
  );
  assert.equal(
    feeApr({ ...pool, communityFee0: null }, prior, 100000, 86400, 0),
    undefined
  );
  assert.equal(
    feeApr({ ...pool, createdAtTimestamp: null }, undefined, 100000, 86400, 0),
    undefined
  );
});
