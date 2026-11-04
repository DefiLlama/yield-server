// Run: node --test src/adaptors/fables/checks.cjs (no network).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const m = require('./math');
const { _test } = require('./index');
const id = `0x${'1'.repeat(64)}`;
const timestamp = 2965 * m.WEEK + m.OFFSET + 10 * 3600;
const price = (decimals = 18, usd = 1) => ({
  decimals,
  price: usd,
  timestamp,
  confidence: 1,
  symbol: 'T',
});
function file() {
  return {
    week: '2965',
    lpBudgets: { [id]: String(168n * m.ONE) },
    refDepth: { [id]: '1' },
    refTick: { [id]: '0' },
    rebaseBps: '0',
    companyBps: '0',
    weeklyBudgetOnChain: String(168n * m.ONE),
  };
}
const range = (lo = -100, hi = 100, l = m.ONE) => ({
  pool_id: id,
  tickLower: lo,
  tickUpper: hi,
  totalStaked: String(l),
});
function args() {
  return {
    pool: { id, tick: 0, sqrtPriceX96: String(m.Q96) },
    ranges: [range()],
    budget: file(),
    coins: [price(), price()],
    reward: price(),
    timestamp,
    killed: false,
  };
}

test('TickMath canonical endpoints and zero', () => {
  assert.equal(m.sqrtAtTick(0), m.Q96);
  assert.equal(m.sqrtAtTick(-887272), 4295128739n);
  assert.equal(
    m.sqrtAtTick(887272),
    1461446703485210103287273052203988822378723970342n
  );
  assert.throws(() => m.sqrtAtTick(887273));
});
test('flat release excludes company/rebase and does not compound', () => {
  const a = args();
  a.budget.rebaseBps = '325';
  a.budget.companyBps = '100';
  a.budget.weeklyBudgetOnChain = String((168n * m.ONE * 10425n) / 10000n);
  m.validateBudget(a.budget, timestamp);
  const [r] = m.rates(a);
  assert.equal(r.hourlyFables, String(m.ONE));
  assert.equal(r.apyReward, (8736 / r.tvlUsd) * 100);
});
test('depth below target reduces release; above target cannot exceed budget', () => {
  const a = args(),
    d = m.depth(m.ONE, -100, 100, 0, 0);
  a.budget.refDepth[id] = String(d * 2n);
  assert.equal(m.rates(a)[0].hourlyFables, String(m.ONE / 2n));
  a.budget.refDepth[id] = String(d / 2n);
  assert.equal(m.rates(a)[0].hourlyFables, String(m.ONE));
});
test('raw liquidity, not capital, splits the pool reward', () => {
  const a = args();
  a.ranges.push(range(-1000, 1000));
  const [narrow, wide] = m.rates(a);
  assert.equal(narrow.hourlyFables, String(m.ONE / 2n));
  assert.equal(wide.hourlyFables, narrow.hourlyFables);
  assert.ok(narrow.apyReward > wide.apyReward * 9);
});
test('out-of-range capital remains TVL but earns no rewards and does not dilute others', () => {
  const a = args();
  a.ranges.push(range(100, 200));
  const rows = m.rates(a);
  assert.equal(rows[0].hourlyFables, String(m.ONE));
  assert.equal(rows[1].apyReward, 0);
  assert.ok(rows[1].tvlUsd > 0);
});
test('lower bound is included, upper bound excluded', () => {
  assert.ok(m.depth(m.ONE, 0, 100, 0, 0) > 0n);
  assert.equal(m.depth(m.ONE, -100, 0, 0, 0), 0n);
});
test('zero stake omitted; killed gauge and zero budget have known zero rate', () => {
  const a = args();
  a.ranges = [range(-100, 100, 0n)];
  assert.deepEqual(m.rates(a), []);
  a.ranges = [range()];
  a.killed = true;
  assert.equal(m.rates(a)[0].apyReward, 0);
  a.killed = false;
  a.budget.lpBudgets[id] = '0';
  assert.equal(m.rates(a)[0].apyReward, 0);
});
test('price cap reduces depth without reducing principal TVL', () => {
  const l = 10n ** 24n,
    uncapped = m.depth(l, 4000, 6000, 5000, 5000),
    capped = m.depth(l, 4000, 6000, 5000, 0);
  assert.ok(capped > 0n && capped < uncapped);
  const a = args();
  a.pool.tick = 5000;
  a.pool.sqrtPriceX96 = String(m.sqrtAtTick(5000));
  a.ranges = [range(4000, 6000, l)];
  const capTvl = m.rates(a)[0].tvlUsd;
  a.budget.refTick[id] = '5000';
  assert.equal(m.rates(a)[0].tvlUsd, capTvl);
});
test('6/18 decimal assets are valued separately; reward mark is live', () => {
  assert.equal(m.value([2000000n, 3n * m.ONE], [price(6), price(18, 2)]), 8);
  const a = args(),
    baseline = m.rates(a)[0].apyReward;
  a.reward.price = 2;
  assert.equal(m.rates(a)[0].apyReward, 2 * baseline);
});
test('missing/stale/low-confidence prices omit rows, never fake zero yield', () => {
  for (const bad of [
    undefined,
    { ...price(), timestamp: timestamp - 10801 },
    { ...price(), confidence: 0.1 },
  ]) {
    const a = args();
    a.coins[0] = bad;
    assert.deepEqual(m.rates(a), []);
  }
});
test('missing depth, incomplete data and duplicates are refused', () => {
  const a = args();
  delete a.budget.refDepth[id];
  assert.throws(() => m.validateBudget(a.budget, timestamp));
  const b = args();
  b.ranges.push(range());
  assert.throws(() => m.rates(b), /Duplicate/);
  const c = args();
  c.pool.tick = null;
  assert.throws(() => m.rates(c), /Missing/);
});
test('Tuesday boundary changes budget; no previous-week fallback', () => {
  const next = 2966 * m.WEEK + m.OFFSET;
  assert.equal(m.epochOf(next - 1), 2965);
  assert.equal(m.epochOf(next), 2966);
  assert.throws(() => m.validateBudget(file(), next), /current epoch/);
});
test('rhythm uses this hour, validates cumulative allowance and total', () => {
  const b = file();
  b.rhythm = { [id]: Array(167).fill('0').concat(String(m.ONE)) };
  m.validateBudget(b, timestamp);
  assert.equal(m.releasePerHour(b, id, timestamp), 0n);
  assert.equal(
    m.releasePerHour(b, id, 2965 * m.WEEK + m.OFFSET + 167 * 3600),
    168n * m.ONE
  );
  b.rhythm[id].reverse();
  assert.throws(() => m.validateBudget(b, timestamp), /Front-loaded/);
  b.rhythm[id] = ['0'];
  assert.throws(() => m.validateBudget(b, timestamp), /length/);
});
test('tiny rows still dilute visible rows; cannot double count reward', () => {
  const a = args();
  a.ranges.push(range(-1000, 1000, 1n * 10n ** 15n));
  const r = m.rates(a);
  assert.ok(BigInt(r[0].hourlyFables) < m.ONE);
  assert.ok(r.reduce((s, x) => s + BigInt(x.hourlyFables), 0n) <= m.ONE);
});
test('query saturation splits by pool; a truncated single pool fails', async () => {
  const get = async (url) => {
    const ids = new URL(url).searchParams.get('ids').split(',');
    return {
      Pool: ids.map((id) => ({ id })),
      Range: ids.length > 1 ? Array(1000).fill({}) : [],
    };
  };
  assert.equal((await _test.books(['a', 'b'], get)).length, 2);
  await assert.rejects(
    _test.books(['a'], async () => ({ Pool: [], Range: Array(1000).fill({}) })),
    /exceeds/
  );
});
test('mismatched file totals are refused', () => {
  const b = file();
  b.weeklyBudgetOnChain = '1';
  assert.throws(() => m.validateBudget(b, timestamp), /Inconsistent/);
});
test('held, stale and errored indexer envelopes are refused', () => {
  const fresh = { headers: {}, data: { data: { Range: [] } } };
  assert.deepEqual(_test.indexData(fresh), { Range: [] });
  assert.throws(
    () => _test.indexData({ ...fresh, headers: { 'x-fables-held': '1' } }),
    /Stale/
  );
  assert.throws(
    () => _test.indexData({ ...fresh, headers: { age: '301' } }),
    /Stale/
  );
  assert.throws(
    () => _test.indexData({ ...fresh, data: { data: {}, errors: [{}] } }),
    /Incomplete/
  );
});

const FABLES = '0xb63d07cef74be747231d601bb2faa6b252c68106';
const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const ZERO = `0x${'0'.repeat(40)}`;
function snapshot(a = args()) {
  return {
    timestamp: a.timestamp,
    budget: a.budget,
    books: [{ pool: a.pool, ranges: a.ranges }],
    pools: [{ id, key: { currency0: ZERO, currency1: FABLES } }],
    state: { [id]: { killed: a.killed, earning: true } },
    prices: {
      [`robinhood:${WETH}`]: a.coins[0],
      [`robinhood:${FABLES}`]: a.reward,
    },
  };
}
const close = (a, b) =>
  assert.ok(
    Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)),
    `${a} != ${b}`
  );

test('one pool row conserves all staked principal without range duplicates', () => {
  const a = args();
  a.ranges.push(range(-1000, 1000), range(100, 200));
  const s = snapshot(a),
    other = `0x${'2'.repeat(64)}`;
  for (const field of ['lpBudgets', 'refDepth', 'refTick'])
    s.budget[field][other] = s.budget[field][id];
  s.budget.weeklyBudgetOnChain = String(336n * m.ONE);
  s.books.push({ pool: { ...a.pool, id: other }, ranges: [range()] });
  s.pools.push({ ...s.pools[0], id: other });
  s.state[other] = { killed: false, earning: true };
  const { pools } = _test.output(s);
  assert.equal(pools.length, 2);
  assert.equal(new Set(pools.map((p) => p.pool)).size, 2);
  assert.equal(pools[0].pool, `fables-staked-${id}-robinhood`);
  close(
    pools.reduce((v, p) => v + p.tvlUsd, 0),
    m.rates(a).reduce((v, r) => v + r.tvlUsd, 0) + m.poolRate(args()).tvlUsd
  );
  assert.equal(pools[0].token, null);
  assert.deepEqual(pools[0].underlyingTokens, [WETH, FABLES]);
  assert.equal(pools[0].symbol, 'ETH-T');
  assert.equal(pools[0].apyBase, undefined);
  assert.equal(pools[0].url, `https://www.fables.fi/deposit/${id}`);
  s.books.push(s.books[0]);
  assert.throws(() => _test.output(s), /duplicate pool/);
});

test('pool APR equals eligible capital-weighted range rates at aligned marks and year', () => {
  const a = args();
  a.ranges.push(range(-1000, 1000, 2n * m.ONE), range(100, 200, 4n * m.ONE));
  a.coins = [price(6, 0.998), price(18, 1.4)];
  a.reward = price(18, 0.056);
  const pool = m.poolRate(a),
    rows = m.rates(a);
  const active = rows.filter((r) => r.depth > 0n);
  close(
    pool.inRangeUsd,
    active.reduce((v, r) => v + r.tvlUsd, 0)
  );
  close(
    pool.apyReward,
    active.reduce((v, r) => v + r.tvlUsd * r.apyReward, 0) / pool.inRangeUsd
  );
  assert.ok(pool.tvlUsd > pool.inRangeUsd);
  const allocated = rows.reduce((v, r) => v + BigInt(r.hourlyFables), 0n);
  assert.ok(BigInt(pool.hourlyFables) >= allocated);
  assert.ok(BigInt(pool.hourlyFables) - allocated < BigInt(active.length));
  assert.equal(m.YEAR, 52 * m.WEEK);
});

test('out-of-range capital changes reported TVL but not the eligible pool rate', () => {
  const a = args(),
    before = m.poolRate(a);
  a.ranges.push(range(100, 200, 100n * m.ONE));
  const after = m.poolRate(a);
  assert.ok(after.tvlUsd > before.tvlUsd * 10);
  assert.equal(after.inRangeUsd, before.inRangeUsd);
  assert.equal(after.apyReward, before.apyReward);
});

test('all-out-of-range pool retains TVL at zero APR; empty pool is omitted', () => {
  const a = args();
  a.ranges = [range(100, 200)];
  const p = _test.output(snapshot(a)).pools;
  assert.equal(p.length, 1);
  assert.ok(p[0].tvlUsd > 0);
  assert.equal(p[0].apyReward, 0);
  a.ranges = [];
  assert.deepEqual(_test.output(snapshot(a)).pools, []);
  a.ranges = [range(-100, 100, 0n)];
  assert.deepEqual(_test.output(snapshot(a)).pools, []);
});

test('missing or stale principal/reward mark omits the pool, never substitutes a peg', () => {
  for (const token of [WETH, FABLES]) {
    const s = snapshot();
    s.prices[`robinhood:${token}`] = {
      ...price(),
      timestamp: timestamp - 10801,
    };
    assert.deepEqual(_test.output(s).pools, []);
    delete s.prices[`robinhood:${token}`];
    assert.deepEqual(_test.output(s).pools, []);
  }
});

test('pool output observes reference depth, killed state and epoch validation', () => {
  const a = args(),
    baseline = _test.output(snapshot(a)).pools[0];
  a.budget.refDepth[id] = String(m.depth(m.ONE, -100, 100, 0, 0) * 2n);
  close(_test.output(snapshot(a)).pools[0].apyReward, baseline.apyReward / 2);
  a.killed = true;
  const killed = _test.output(snapshot(a)).pools[0];
  assert.equal(killed.apyReward, 0);
  assert.equal(killed.frozen, true);
  a.timestamp = 2966 * m.WEEK + m.OFFSET;
  assert.throws(() => _test.output(snapshot(a)), /current epoch/);
});

test('pool output uses a future scheduled hourly rhythm, not a flat weekly headline', () => {
  const a = args(),
    flat = m.poolRate(a).apyReward;
  a.budget.rhythm = { [id]: Array(167).fill('0').concat(String(m.ONE)) };
  assert.equal(_test.output(snapshot(a)).pools[0].apyReward, 0);
  a.timestamp = 2965 * m.WEEK + m.OFFSET + 167 * 3600;
  a.coins = [price(), price()].map((p) => ({ ...p, timestamp: a.timestamp }));
  a.reward = { ...price(), timestamp: a.timestamp };
  close(_test.output(snapshot(a)).pools[0].apyReward, flat * 168);
});
