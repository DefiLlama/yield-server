const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BigNumber = require('bignumber.js');

const USDC =
  'ibc/6490A7EAB61059BFC1CDDEB05917DD70BDF3A611654162A1A47DB930D40D8AF4';
const STZIG =
  'coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig';
const DENOMS = ['azig', STZIG, USDC];
const source = fs.readFileSync(
  path.join(__dirname, '../src/adaptors/permapod/index.js'),
  'utf8',
);

function load({ fail, invalid, paused, paginate = false } = {}) {
  const calls = [];
  const params = DENOMS.map((denom) => ({
    denom,
    credit_manager: { whitelisted: true },
    red_bank: { deposit_enabled: denom !== paused, borrow_enabled: true },
    max_loan_to_value: '0.6',
  }));
  const markets = {
    azig: {
      collateral_total_amount: '1000000000000000000000000',
      debt_total_amount: '200000000000000000000000',
    },
    [STZIG]: {
      collateral_total_amount: '1000000000000',
      debt_total_amount: '1000000',
    },
    [USDC]: {
      collateral_total_amount: '670000000000',
      debt_total_amount: '669997110000',
    },
  };
  const prices = { azig: '0.00000000000006', [STZIG]: '0.065', [USDC]: '1' };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    Buffer,
    require(name) {
      if (name === 'bignumber.js') return BigNumber;
      assert.equal(name, '../utils');
      return {
        aprToApy: (apr, frequency) =>
          ((1 + apr / 100 / frequency) ** frequency - 1) * 100,
        async getData(url) {
          const u = new URL(url);
          const query = JSON.parse(
            Buffer.from(u.pathname.split('/').pop(), 'base64').toString(),
          );
          calls.push({
            host: u.host,
            contract: u.pathname.split('/')[5],
            query,
          });
          if (query.all_asset_params_v2) {
            const start = query.all_asset_params_v2.start_after;
            return {
              data: {
                data: paginate
                  ? start
                    ? params.slice(1)
                    : params.slice(0, 1)
                  : params,
                metadata: { has_more: paginate && !start },
              },
            };
          }
          const denom = (query.market_v2 ?? query.price).denom;
          if (denom === fail) throw new Error('RPC unavailable');
          if (query.price)
            return {
              data: { price: denom === invalid ? 'NaN' : prices[denom] },
            };
          return {
            data: {
              ...markets[denom],
              liquidity_rate: '0.12',
              borrow_rate: '0.20',
            },
          };
        },
      };
    },
  });
  return { apy: module.exports.apy, calls };
}

test('queries v2 contracts and prices 18-decimal azig without changing the historical pool key', async () => {
  const { apy, calls } = load();
  const pools = await apy();
  const zig = pools.find((p) => p.symbol === 'ZIG');
  assert.equal(zig.pool, 'permapod-uzig-zigchain');
  assert.equal(zig.underlyingTokens[0], 'azig');
  assert.equal(zig.borrowToken, 'azig');
  assert.equal(zig.totalSupplyUsd, 60000);
  assert.equal(zig.totalBorrowUsd, 12000);
  assert.equal(zig.tvlUsd, 48000);
  assert.ok(zig.apyBase > 12 && zig.apyBase < 13);
  assert.ok(calls.every((c) => c.host === 'zigchain-mainnet-lcd.zigscan.net'));
  assert.ok(
    calls.some(
      (c) =>
        c.contract ===
        'zig1qghek6p63r56j0dd5asxvc5fmu370l6yfql5spc2khsfzn0ennjqtwz3xz',
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.contract ===
        'zig13ynkhd699jfeptcs3kxezacqptdll3fjnxm3gxlwdezvz4nw9s7qaf3mkk',
    ),
  );
});

test('retains nearly fully utilized USDC with accurate available liquidity', async () => {
  const pools = await load().apy();
  const usdc = pools.find((p) => p.symbol === 'USDC');
  assert.equal(usdc.pool, `permapod-${USDC}-zigchain`.toLowerCase());
  assert.equal(usdc.totalSupplyUsd, 670000);
  assert.equal(usdc.availableBorrowUsd, 2.89);
  assert.equal(usdc.tvlUsd, 2.89);
  assert.ok(usdc.apyBase > 0);
  assert.equal(pools.find((p) => p.symbol === 'stZIG').totalSupplyUsd, 65000);
});

test('follows v2 pagination and omits paused markets', async () => {
  const { apy, calls } = load({ paginate: true, paused: STZIG });
  assert.equal((await apy()).length, 2);
  assert.equal(calls.filter((c) => c.query.all_asset_params_v2).length, 2);
  assert.ok(
    !calls.some((c) => (c.query.market_v2 ?? c.query.price)?.denom === STZIG),
  );
});

test('surfaces RPC failures instead of publishing an incomplete snapshot', async () => {
  await assert.rejects(load({ fail: USDC }).apy(), /RPC unavailable/);
});

test('rejects invalid oracle data instead of publishing NaN or zero-valued TVL', async () => {
  await assert.rejects(
    load({ invalid: 'azig' }).apy(),
    /Invalid Perma Pod market data/,
  );
});
