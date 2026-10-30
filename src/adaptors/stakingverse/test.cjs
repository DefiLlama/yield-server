const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const BigNumber = require('bignumber.js');
const SOURCE = require('node:path').join(__dirname, 'index.js');
const V = '0x8a93a876912c9f03f88bc9114847cf5b63c89f56',
  A = '0x1111111111111111111111111111111111111111',
  B = '0x2222222222222222222222222222222222222222',
  F = '0x3333333333333333333333333333333333333333';
const ZERO = '0x0000000000000000000000000000000000000000',
  OS = '0xf1c9acdc66974dfb6decb12aa385b9cd01190e38',
  E = 10n ** 18n;
const now = 1792735200,
  hash = '0x' + 'a'.repeat(64),
  CID = 'QmYHxQPCDK7C6ttWi5DvQufttFXU4xFTVy7YLydspUY86d';
const units = (n) => (BigInt(n) * E).toString();
const row = (a) => ({ id: V + '-' + a, address: a });
const clone = (o) => JSON.parse(JSON.stringify(o));
function fixture(nowOverride = now) {
  const now = nowOverride;
  return {
    meta: {
      deployment: CID,
      hasIndexingErrors: false,
      block: { number: 26253000, timestamp: now - 60, hash },
    },
    vault: {
      isErc20: false,
      isPrivate: false,
      isBlocklist: false,
      isGenesis: false,
      version: '5',
    },
    snapshots: Array.from({ length: 7 }, (_, i) => ({
      timestamp: String(
        (Math.floor((now - 60 + 30) / 86400) - 1 - i) * 86400 * 1e6
      ),
      apy: String(2 + i / 10),
    })),
    rows: [row(A), row(B)],
    assets: units(100),
    shares: units(100),
    queue: [units(20), '0', '0', '0', '0'],
    fee: F,
    version: '5',
    balances: { [A]: units(70), [B]: units(10) },
    debts: { [A]: units(10) },
    impl: '0x' + '0'.repeat(24) + '927a83c679a5e1a6435d6bfaef7f20d4db23e2cc',
    coins: {
      ['ethereum:' + ZERO]: { price: 2000, timestamp: now - 10 },
      ['ethereum:' + OS]: { price: 2100, timestamp: now - 10 },
    },
  };
}
function load(f, nowOverride = now) {
  const events = [];
  let blocks = 0;
  const sdk = {
    getProvider: () => ({
      getBlock: async (n) => {
        events.push(['getBlock', n]);
        blocks++;
        return f.blockMissing
          ? null
          : {
              ...f.meta.block,
              hash:
                blocks > 1 && f.reorg
                  ? '0x' + 'b'.repeat(64)
                  : f.rpcHash || f.meta.block.hash,
              timestamp: f.rpcTime ?? f.meta.block.timestamp,
            };
      },
      getStorage: async (...args) => {
        events.push(['storage', ...args]);
        return f.impl;
      },
    }),
    api: {
      abi: {
        call: async (x) => {
          events.push(['call', x]);
          let out;
          if (x.abi.includes('totalAssets')) out = f.assets;
          else if (x.abi.includes('totalShares')) out = f.shares;
          else if (x.abi.includes('getExitQueueData')) out = f.queue;
          else if (x.abi.includes('feeRecipient')) out = f.fee;
          else if (x.abi.includes('version')) out = f.version;
          else if (x.abi.includes('convertToAssets'))
            out =
              f.converted ??
              (
                (BigInt(x.params[0]) * BigInt(f.assets)) /
                BigInt(f.shares)
              ).toString();
          else throw Error('unknown ABI ' + x.abi);
          return { output: out };
        },
        multiCall: async (x) => {
          events.push(['multiCall', x]);
          const kind = x.abi.includes('getShares') ? 'balances' : 'debts';
          let output = x.calls.map((c) => ({
            input: c,
            success: true,
            output: f[kind][c.params[0]] || '0',
          }));
          if (f.mutateMulticall) output = f.mutateMulticall(output, kind);
          return { output };
        },
      },
    },
  };
  const axios = {
    post: async (url, { query }) => {
      events.push(['graph', query]);
      if (f.graphError) return { data: { errors: [{ message: 'failure' }] } };
      let data = { _meta: clone(f.meta) };
      if (f.pinnedMismatch && query.includes('_meta(block'))
        data._meta.block.hash = '0x' + 'f'.repeat(64);
      if (query.includes('vault(id:'))
        Object.assign(data, { vault: f.vault, vaultSnapshots: f.snapshots });
      if (query.includes('allocators(')) {
        const cursor = query.match(/id_gt: "([^"]*)"/)[1];
        data.allocators = f.pageOverride
          ? f.pageOverride(cursor)
          : f.rows.filter((r) => r.id > cursor).slice(0, 1000);
      }
      return { data: { data } };
    },
  };
  const context = {
    module: { exports: {} },
    require: (n) =>
      ({
        '@defillama/sdk': sdk,
        axios,
        'bignumber.js': BigNumber,
        '../utils': { getPriceApiData: async () => ({ coins: f.coins }) },
      }[n]),
    Date: class extends Date {
      static now() {
        return nowOverride * 1000;
      }
    },
    console,
  };
  vm.runInNewContext(fs.readFileSync(SOURCE, 'utf8'), context, {
    filename: SOURCE,
  });
  return {
    run: () => context.module.exports.apy(),
    events,
    exported: context.module.exports,
  };
}
let passed = 0;
const results = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, pass: true });
    console.log('PASS ' + name);
  } catch (e) {
    results.push({ name, pass: false, error: e.stack });
    console.error('FAIL ' + name + ' ' + e.stack);
    process.exitCode = 1;
  }
}
async function reject(name, change, match) {
  await test(name, async () => {
    const f = fixture();
    change(f);
    await assert.rejects(load(f).run(), match);
  });
}
module.exports = {
  fixture,
  load,
  V,
  A,
  B,
  F,
  ZERO,
  OS,
  E,
  now,
  hash,
  CID,
  units,
  row,
  clone,
};
if (require.main === module)
  (async () => {
    await test('base net market-valued active TVL and seven-day unleveraged rate', async () => {
      const l = load(fixture()),
        r = await l.run();
      assert.equal(r.length, 1);
      assert.equal(r[0].tvlUsd, 139000);
      assert.equal(r[0].apyBase, 2.3);
      assert.equal(r[0].pool, V + '-ethereum');
      assert.equal(r[0].project, 'stakingverse');
      assert.equal(l.exported.protocolId, '6082');
      assert.equal(l.exported.timetravel, false);
    });
    await test('all RPC calls and graph pages pinned to one block', async () => {
      const l = load(fixture());
      await l.run();
      for (const [kind, x] of l.events) {
        if (kind === 'call' || kind === 'multiCall')
          assert.equal(x.block, 26253000);
        if (kind === 'graph' && x.includes('allocators(')) {
          assert(x.includes('block: { hash: "' + hash + '" }'));
          assert(!/shares_gt|minted.*gt/.test(x));
        }
      }
    });
    await test('ordinary queue entry removes collateral immediately but retains account debt', async () => {
      const f = fixture();
      f.queue[0] = units(40);
      f.balances[A] = units(50);
      assert.equal((await load(f).run())[0].tvlUsd, 99000);
    });
    await test('osETH exit transfers queued collateral and corresponding debt out together', async () => {
      const f = fixture();
      f.queue[0] = units(40);
      f.balances[A] = units(50);
      f.debts[A] = '0';
      assert.equal((await load(f).run())[0].tvlUsd, 120000);
    });
    await test('partial checkpoint burns queued shares and assets without removing active shares', async () => {
      const f = fixture();
      f.assets = units(90);
      f.shares = units(90);
      f.queue[0] = units(10);
      assert.equal((await load(f).run())[0].tvlUsd, 139000);
    });
    await test('full checkpoint excludes settled but unclaimed collateral', async () => {
      const f = fixture();
      f.assets = units(80);
      f.shares = units(80);
      f.queue[0] = '0';
      f.queue[1] = units(20);
      assert.equal((await load(f).run())[0].tvlUsd, 139000);
    });
    await test('ordinary claim changes excluded collateral only', async () => {
      const f = fixture();
      f.assets = units(80);
      f.shares = units(80);
      f.queue[0] = '0';
      f.queue[1] = units(10);
      assert.equal((await load(f).run())[0].tvlUsd, 139000);
    });
    await test('partial escrow claim and remaining collateral never reenter active accounting', async () => {
      const f = fixture();
      f.assets = units(80);
      f.shares = units(80);
      f.queue = [0, 7, 0, 0, 999].map(String);
      f.debts[A] = '0';
      assert.equal((await load(f).run())[0].tvlUsd, 160000);
    });
    await test('legacy exiting assets are excluded without an addback', async () => {
      const f = fixture();
      f.queue[3] = units(999);
      f.queue[4] = units(888);
      assert.equal((await load(f).run())[0].tvlUsd, 139000);
    });
    await test('rounding follows contract convertToAssets rather than false strict checkpoint invariance', async () => {
      const f = fixture();
      f.assets = '107';
      f.shares = '100';
      f.queue[0] = '20';
      f.balances = { [A]: '70', [B]: '10' };
      f.debts = {};
      const r = await load(f).run();
      assert.equal(r[0].tvlUsd, 1.7e-13);
    });
    await test('zero collateral historical owner debt still deducted', async () => {
      const f = fixture();
      f.balances[B] = '0';
      f.balances[A] = units(80);
      f.debts[B] = units(5);
      assert.equal((await load(f).run())[0].tvlUsd, 128500);
    });
    await test('fee-recipient collateral and fee-adjusted debt counted', async () => {
      const f = fixture();
      f.balances[A] = units(60);
      f.balances[F] = units(10);
      f.debts[F] = units(1);
      assert.equal((await load(f).run())[0].tvlUsd, 136900);
    });
    await test('vault seed collateral counted even if missing allocator row', async () => {
      const f = fixture();
      f.balances[A] = units(60);
      f.balances[V] = units(10);
      assert.equal((await load(f).run())[0].tvlUsd, 139000);
    });
    await test('vault and fee recipient already indexed are deduplicated', async () => {
      const f = fixture();
      f.rows = [...f.rows, row(F), row(V)].sort((a, b) =>
        a.id.localeCompare(b.id)
      );
      assert.equal((await load(f).run())[0].tvlUsd, 139000);
    });
    await test('unfiltered pagination includes more than1000historical accounts', async () => {
      const f = fixture();
      f.rows = Array.from({ length: 1001 }, (_, i) =>
        row('0x' + (i + 1).toString(16).padStart(40, '0'))
      )
        .concat([row(A), row(B)])
        .sort((a, b) => a.id.localeCompare(b.id));
      const l = load(f);
      assert.equal((await l.run())[0].tvlUsd, 139000);
      assert.equal(
        l.events.filter((x) => x[0] === 'graph' && x[1].includes('allocators('))
          .length,
        2
      );
    });
    await test('negative single day retained when seven-day mean positive', async () => {
      const f = fixture();
      f.snapshots[0].apy = '-1';
      assert.equal((await load(f).run())[0].apyBase, 13.1 / 7);
    });
    await test('zero realized return accepted', async () => {
      const f = fixture();
      f.snapshots.forEach((s) => (s.apy = '0'));
      assert.equal((await load(f).run())[0].apyBase, 0);
    });
    const cases = [
      [
        'source deployment changed',
        (f) => (f.meta.deployment = 'other'),
        /deployment/,
      ],
      [
        'indexing error',
        (f) => (f.meta.hasIndexingErrors = true),
        /deployment/,
      ],
      [
        'missing indexing error flag',
        (f) => delete f.meta.hasIndexingErrors,
        /deployment/,
      ],
      [
        'stale index',
        (f) => (f.meta.block.timestamp = now - 3601),
        /indexed block/,
      ],
      [
        'future index',
        (f) => (f.meta.block.timestamp = now + 301),
        /indexed block/,
      ],
      [
        'invalid indexed hash',
        (f) => (f.meta.block.hash = '0x1'),
        /indexed block/,
      ],
      [
        'unsafe block',
        (f) => (f.meta.block.number = Number.MAX_SAFE_INTEGER + 1),
        /indexed block/,
      ],
      [
        'pinned graph hash changed',
        (f) => (f.pinnedMismatch = true),
        /inconsistent/,
      ],
      ['GraphQL errors', (f) => (f.graphError = true), /subgraph response/],
      ['RPC missing block', (f) => (f.blockMissing = true), /RPC\/subgraph/],
      [
        'RPC wrong block hash',
        (f) => (f.rpcHash = '0x' + 'b'.repeat(64)),
        /RPC\/subgraph/,
      ],
      [
        'RPC timestamp disagreement',
        (f) => (f.rpcTime = now - 61),
        /RPC\/subgraph/,
      ],
      [
        'proxy implementation changed',
        (f) => (f.impl = '0x' + '0'.repeat(64)),
        /implementation/,
      ],
      ['end-of-run reorg', (f) => (f.reorg = true), /block changed/],
      ['private vault', (f) => (f.vault.isPrivate = true), /unsupported/],
      ['blocklist vault', (f) => (f.vault.isBlocklist = true), /unsupported/],
      ['ERC20 vault', (f) => (f.vault.isErc20 = true), /unsupported/],
      ['Genesis vault', (f) => (f.vault.isGenesis = true), /unsupported/],
      ['graph version changed', (f) => (f.vault.version = '6'), /unsupported/],
      ['RPC version changed', (f) => (f.version = '6'), /RPC vault version/],
      ['missing vault', (f) => (f.vault = null), /unsupported/],
      ['only6daily samples', (f) => f.snapshots.pop(), /seven daily/],
      [
        'extra daily sample',
        (f) => f.snapshots.push(f.snapshots[6]),
        /seven daily/,
      ],
      [
        'missing daily sample',
        (f) =>
          (f.snapshots[3].timestamp = String(
            BigInt(f.snapshots[3].timestamp) - 86400n * 1000000n
          )),
        /non-contiguous/,
      ],
      [
        'old latest yield',
        (f) =>
          f.snapshots.forEach(
            (s) =>
              (s.timestamp = String(BigInt(s.timestamp) - 86400n * 1000000n))
          ),
        /non-contiguous/,
      ],
      [
        'future yield',
        (f) =>
          f.snapshots.forEach(
            (s) =>
              (s.timestamp = String(BigInt(s.timestamp) + 86400n * 1000000n))
          ),
        /non-contiguous/,
      ],
      [
        'seconds mistaken for microseconds',
        (f) =>
          (f.snapshots[0].timestamp = String(
            Number(f.snapshots[0].timestamp) / 1e6
          )),
        /non-contiguous/,
      ],
      [
        'NaN daily rate',
        (f) => (f.snapshots[0].apy = 'NaN'),
        /daily staking rate/,
      ],
      [
        'missing daily rate',
        (f) => delete f.snapshots[0].apy,
        /daily staking rate/,
      ],
      [
        'infinite rate',
        (f) => (f.snapshots[0].apy = 'Infinity'),
        /daily staking rate/,
      ],
      [
        'negative seven-day rate',
        (f) => f.snapshots.forEach((s) => (s.apy = '-1')),
        /negative/,
      ],
      [
        'missing owner reconciles false',
        (f) => (f.rows = [row(A)]),
        /coverage/,
      ],
      [
        'malformed allocator id',
        (f) => (f.rows[0].id = 'invalid'),
        /allocator/,
      ],
      [
        'invalid owner address',
        (f) => (f.rows[0].address = 'notanaddress'),
        /allocator/,
      ],
      ['duplicate allocator', (f) => (f.rows = [row(A), row(A)]), /duplicate/],
      ['reversed allocator order', (f) => f.rows.reverse(), /cursor/],
      [
        'oversized allocator page',
        (f) => (f.pageOverride = () => Array(1001).fill(row(A))),
        /allocator page/,
      ],
      [
        'null allocator page',
        (f) => (f.pageOverride = () => null),
        /allocator page/,
      ],
      [
        'missing multicall row',
        (f) => (f.mutateMulticall = (o) => o.slice(1)),
        /incomplete/,
      ],
      [
        'failed multicall row',
        (f) =>
          (f.mutateMulticall = (o) => {
            o[0].success = false;
            return o;
          }),
        /multicall/,
      ],
      [
        'wrong multicall owner',
        (f) =>
          (f.mutateMulticall = (o) => {
            o[0].input = { ...o[0].input, params: [B] };
            return o;
          }),
        /multicall/,
      ],
      [
        'wrong multicall target',
        (f) =>
          (f.mutateMulticall = (o) => {
            o[0].input = { ...o[0].input, target: A };
            return o;
          }),
        /multicall/,
      ],
      ['noninteger debt', (f) => (f.debts[A] = '1.1'), /fee-synced/],
      ['negative debt', (f) => (f.debts[A] = '-1'), /fee-synced/],
      [
        'null debt response',
        (f) =>
          (f.mutateMulticall = (o, k) => {
            if (k === 'debts') o[0].output = null;
            return o;
          }),
        /fee-synced/,
      ],
      ['zero total shares', (f) => (f.shares = '0'), /share supply/],
      [
        'queued greater than supply',
        (f) => (f.queue[0] = units(101)),
        /share supply/,
      ],
      ['invalid asset integer', (f) => (f.assets = '1e18'), /total assets/],
      ['invalid queue size', (f) => f.queue.pop(), /queue data/],
      [
        'negative excluded queue field',
        (f) => (f.queue[4] = '-1'),
        /queue field/,
      ],
      ['convertToAssets mismatch', (f) => (f.converted = '1'), /active assets/],
      ['invalid fee recipient', (f) => (f.fee = '0x0'), /fee recipient/],
      [
        'stale ETH price',
        (f) => (f.coins['ethereum:' + ZERO].timestamp = now - 3601),
        /ETH price/,
      ],
      [
        'stale osETH price',
        (f) => (f.coins['ethereum:' + OS].timestamp = now - 3601),
        /osETH price/,
      ],
      [
        'future price',
        (f) => (f.coins['ethereum:' + OS].timestamp = now + 301),
        /osETH price/,
      ],
      [
        'missing ETH price',
        (f) => delete f.coins['ethereum:' + ZERO],
        /ETH price/,
      ],
      [
        'missing osETH price',
        (f) => delete f.coins['ethereum:' + OS],
        /osETH price/,
      ],
      [
        'zero ETH price',
        (f) => (f.coins['ethereum:' + ZERO].price = 0),
        /non-positive/,
      ],
      [
        'negative osETH price',
        (f) => (f.coins['ethereum:' + OS].price = -1),
        /non-positive/,
      ],
      [
        'null price',
        (f) => (f.coins['ethereum:' + OS].price = null),
        /osETH price/,
      ],
      [
        'nonfinite price',
        (f) => (f.coins['ethereum:' + OS].price = 'Infinity'),
        /osETH price/,
      ],
      ['negative net TVL', (f) => (f.debts[A] = units(100)), /net TVL/],
      [
        'zero net TVL',
        (f) => {
          f.debts[A] = units(80);
          f.coins['ethereum:' + OS].price = 2000;
        },
        /net TVL/,
      ],
    ];
    for (const [n, f, m] of cases) await reject(n, f, m);
    if (process.env.STAKINGVERSE_TEST_OUTPUT)
      fs.writeFileSync(
        process.env.STAKINGVERSE_TEST_OUTPUT,
        JSON.stringify(
          {
            source: SOURCE,
            at: new Date().toISOString(),
            passed,
            failed: results.length - passed,
            results,
          },
          null,
          2
        )
      );
    console.log(`${passed}/${results.length} passed`);
  })();
