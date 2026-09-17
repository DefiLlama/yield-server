const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(
  `${__dirname}/../src/adaptors/elara-finance/index.js`,
  'utf8'
);
const baseline = Date.parse('2026-07-10T00:26:59Z') / 1000;
const year = 365 * 86400;

async function run({
  price = '1100000000000000000',
  elapsed = year / 2,
  supply = '100000000000000000000',
  fail = false,
} = {}) {
  const calls = [];
  const sdk = {
    api: {
      util: {
        getLatestBlock: async () => ({
          number: 123,
          timestamp: baseline + elapsed,
        }),
      },
      abi: {
        call: async (params) => {
          if (fail) throw new Error('RPC unavailable');
          calls.push(params);
          return {
            output: {
              'uint256:sharePrice': price,
              'uint256:totalElUSD': '110000000000000000000',
              'erc20:totalSupply': supply,
            }[params.abi],
          };
        },
      },
    },
  };
  const context = { module: { exports: {} }, require: () => sdk };
  vm.runInNewContext(source, context);
  return { pools: await context.module.exports.apy(), calls };
}

test('compounds share appreciation and values only accounted staking assets', async () => {
  const {
    pools: [pool],
    calls,
  } = await run();
  // 10% over half a year is 20% APR, but 21% APY.
  assert.ok(Math.abs(pool.apyBase - 21) < 1e-10);
  assert.equal(pool.tvlUsd, 110);
  assert.equal(pool.pricePerShare, 1.1);
  assert.equal(pool.apyReward, undefined);
  assert.equal(
    pool.pool,
    '0x0c5b226e075431646c8fd0a909b430e10416a1de-ethereum'
  );
  assert.ok(
    calls.every(({ block, chain }) => block === 123 && chain === 'ethereum')
  );
  assert.deepEqual(
    calls.map(({ abi, target }) => [abi, target.toLowerCase()]),
    [
      ['uint256:sharePrice', '0xda34688c14ae164e75d902a962e6c45cd9564448'],
      ['uint256:totalElUSD', '0xda34688c14ae164e75d902a962e6c45cd9564448'],
      ['erc20:totalSupply', '0x0c5b226e075431646c8fd0a909b430e10416a1de'],
    ]
  );
});

test('reports flat and negative returns without turning losses into rewards', async () => {
  assert.equal(
    (await run({ price: '1000000000000000000' })).pools[0].apyBase,
    0
  );
  const loss = (await run({ price: '900000000000000000' })).pools[0].apyBase;
  assert.ok(Math.abs(loss + 19) < 1e-10);
});

test('does not publish an empty pool or annualize a nonpositive interval', async () => {
  assert.equal((await run({ supply: '0' })).pools.length, 0);
  assert.equal((await run({ elapsed: 0 })).pools.length, 0);
  assert.equal((await run({ elapsed: -1 })).calls.length, 0);
});

test('propagates RPC failures instead of publishing a fabricated zero', async () => {
  await assert.rejects(run({ fail: true }), /RPC unavailable/);
});
