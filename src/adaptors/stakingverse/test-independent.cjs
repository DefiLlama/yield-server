// Additional independent boundary and completeness checks. These execute the
// unchanged adapter with mocked I/O, not a fork or Solidity contract harness.
const fs = require('fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const harness = require('./test.cjs');
const SOURCE = path.join(__dirname, 'index.js');
const out = [];
function getHarness(now = harness.now) {
  return {
    ...harness,
    now,
    fixture: () => harness.fixture(now),
    load: (fixture) => harness.load(fixture, now),
  };
}
async function test(name, fn) {
  try {
    await fn();
    out.push({ name, pass: true });
    console.log('PASS ' + name);
  } catch (e) {
    out.push({ name, pass: false, error: e.stack });
    console.log('FAIL ' + name + ' ' + e.stack);
    process.exitCode = 1;
  }
}
(async () => {
  const day = Math.floor(1792735200 / 86400) * 86400;
  for (const second of [0, 1, 86368, 86369, 86370, 86371, 86399]) {
    await test('daily cutoff block second ' + second, async () => {
      // Keep clock sixty seconds after the tested indexed block, including the
      // case where wall-clock date differs from the index date.
      const h = getHarness(day + second + 60),
        f = h.fixture();
      assert.equal(f.meta.block.timestamp, day + second);
      const r = await h.load(f).run();
      assert.equal(r[0].apyBase, 2.3);
    });
  }
  await test('final 30-second window cannot accept previous-day newest label', async () => {
    const h = getHarness(day + 86371 + 60),
      f = h.fixture();
    f.snapshots.forEach(
      (x) => (x.timestamp = String(BigInt(x.timestamp) - 86400n * 1000000n))
    );
    await assert.rejects(h.load(f).run(), /yield history/);
  });
  await test('exactly 1000 rows requires completing the next empty page', async () => {
    const h = getHarness(),
      f = h.fixture();
    f.rows = Array.from({ length: 998 }, (_, i) =>
      h.row('0x' + (i + 1).toString(16).padStart(40, '0'))
    )
      .concat([h.row(h.A), h.row(h.B)])
      .sort((a, b) => a.id.localeCompare(b.id));
    const l = h.load(f);
    assert.equal((await l.run())[0].tvlUsd, 139000);
    assert.equal(
      l.events.filter((e) => e[0] === 'graph' && e[1].includes('allocators('))
        .length,
      2
    );
  });
  await test('repeating full page rejected at next cursor', async () => {
    const h = getHarness(),
      f = h.fixture();
    const rows = Array.from({ length: 1000 }, (_, i) =>
      h.row('0x' + (i + 1).toString(16).padStart(40, '0'))
    );
    f.pageOverride = () => rows;
    await assert.rejects(h.load(f).run(), /cursor or duplicate/);
  });
  await test('20 full pages never silently treated complete', async () => {
    const h = getHarness(),
      f = h.fixture();
    f.rows = Array.from({ length: 20000 }, (_, i) =>
      h.row('0x' + (i + 1).toString(16).padStart(40, '0'))
    );
    await assert.rejects(h.load(f).run(), /pagination incomplete/);
  });
  for (const number of [0, -1, -26253000, 1.5, '26253000'])
    await test('invalid indexed block ' + number, async () => {
      const h = getHarness(),
        f = h.fixture();
      f.meta.block.number = number;
      await assert.rejects(h.load(f).run(), /indexed block/);
    });
  for (const flag of [null, undefined, 0, 'false'])
    await test('invalid indexing-error flag ' + String(flag), async () => {
      const h = getHarness(),
        f = h.fixture();
      f.meta.hasIndexingErrors = flag;
      await assert.rejects(h.load(f).run(), /deployment/);
    });
  await test('numeric uint above safe integer rejected', async () => {
    const h = getHarness(),
      f = h.fixture();
    f.assets = Number.MAX_SAFE_INTEGER + 1;
    await assert.rejects(h.load(f).run(), /total assets/);
  });
  await test('all zero active stake cannot report positive TVL', async () => {
    const h = getHarness(),
      f = h.fixture();
    f.queue[0] = f.shares;
    f.balances = {};
    f.debts = {};
    await assert.rejects(h.load(f).run(), /net TVL/);
  });
  await test('fee debt on zero-share allocator affects net after partial exits', async () => {
    const h = getHarness(),
      f = h.fixture();
    f.balances[h.B] = '0';
    f.balances[h.A] = h.units(80);
    f.debts[h.B] = '5000000000000000001';
    const r = await h.load(f).run();
    assert.equal(r[0].tvlUsd, 128500);
  });
  await test('astronomical daily rate rejected after numeric conversion', async () => {
    const h = getHarness(),
      f = h.fixture();
    f.snapshots[0].apy = '1e400';
    await assert.rejects(h.load(f).run(), /staking rate/);
  });
  await test('zero osETH price rejected independently', async () => {
    const h = getHarness(),
      f = h.fixture();
    Object.values(f.coins)[1].price = 0;
    await assert.rejects(h.load(f).run(), /non-positive/);
  });
  await test('oracle skew exactly 300 seconds allowed', async () => {
    const h = getHarness(),
      f = h.fixture();
    Object.values(f.coins).forEach((x) => (x.timestamp = h.now + 300));
    assert.equal((await h.load(f).run())[0].tvlUsd, 139000);
  });
  await test('price age exactly 3600 seconds allowed', async () => {
    const h = getHarness(),
      f = h.fixture();
    Object.values(f.coins).forEach((x) => (x.timestamp = h.now - 3600));
    assert.equal((await h.load(f).run())[0].tvlUsd, 139000);
  });
  const summary = {
    type:
      'independent additional tests using author fixture harness; actual adapter loaded unchanged',
    source: 'index.js',
    sha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(SOURCE))
      .digest('hex'),
    passed: out.filter((x) => x.pass).length,
    failed: out.filter((x) => !x.pass).length,
    results: out,
  };
  if (process.env.STAKINGVERSE_INDEPENDENT_TEST_OUTPUT)
    fs.writeFileSync(
      process.env.STAKINGVERSE_INDEPENDENT_TEST_OUTPUT,
      JSON.stringify(summary, null, 2) + '\n'
    );
  console.log(summary.passed + '/' + out.length + ' passed');
})();
