const assert = require('node:assert/strict');
const test = require('node:test');

const { buildPoolIndex, getPoolFromIndex } = require('./enriched');

test('returns one sanitized pool from the index without mutating cached data', () => {
  const pool = {
    pool: '7c9f6f01-7b26-4f65-9f01-d55500f6714b',
    project: 'example',
    poolTokenAddress: '0x1234',
  };
  const index = buildPoolIndex([pool]);

  assert.deepEqual(getPoolFromIndex(index, pool.pool), [
    {
      pool: pool.pool,
      project: 'example',
    },
  ]);
  assert.equal(pool.poolTokenAddress, '0x1234');
});

test('returns an empty array when the pool is not in the index', () => {
  const index = buildPoolIndex([]);

  assert.deepEqual(
    getPoolFromIndex(index, '7c9f6f01-7b26-4f65-9f01-d55500f6714b'),
    []
  );
});
