const WEEK = 604800;
const OFFSET = 432000; // epochs roll over on Tuesday 00:00 UTC
const Q96 = 1n << 96n;
const ONE = 10n ** 18n;
const YEAR = 52 * WEEK; // the app annualises staking APR over 52 weeks
const epochOf = timestamp => Math.floor((timestamp - OFFSET) / WEEK);

// Native-bigint port of Uniswap v3-sdk TickMath (MIT, notice below).
// https://github.com/Uniswap/v3-sdk/blob/main/src/utils/tickMath.ts
/* Copyright (c) 2021 Uniswap Labs
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
const FACTORS = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n
];
function sqrtAtTick(tick) {
  if (!Number.isInteger(tick) || Math.abs(tick) > 887272)
    throw Error('Invalid tick');
  const t = Math.abs(tick);
  let ratio = 1n << 128n;
  FACTORS.forEach((factor, i) => {
    if (t & (1 << i)) ratio = (ratio * factor) >> 128n;
  });
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) ? 1n : 0n);
}
function uint(raw) {
  if (typeof raw !== 'string' || !/^\d{1,78}$/.test(raw))
    throw Error('Missing/invalid integer');
  return BigInt(raw);
}
// Token amounts held by `liquidity` over [lower, upper) at sqrtPrice.
function amounts(liquidity, lower, upper, sqrtPrice) {
  const a = sqrtAtTick(lower),
    b = sqrtAtTick(upper);
  if (a >= b || sqrtPrice <= 0n || liquidity < 0n) throw Error('Invalid range');
  const p = sqrtPrice < a ? a : sqrtPrice > b ? b : sqrtPrice;
  return [(liquidity * (b - p) * Q96) / b / p, (liquidity * (p - a)) / Q96];
}
// Staked depth in token1 units, as the emission stream measures it: zero when
// the range is out of range; token0 valued at the tick, capped at
// referenceTick + 2232.
function depth(liquidity, lower, upper, tick, referenceTick) {
  if (liquidity === 0n || tick < lower || tick >= upper) return 0n;
  const a = sqrtAtTick(lower),
    b = sqrtAtTick(upper),
    p = sqrtAtTick(tick);
  const token1 = (liquidity * (p - a)) / Q96;
  const cap = referenceTick + 2232;
  if (tick <= cap) return token1 + (liquidity * (b - p) * p) / b / Q96;
  const c = sqrtAtTick(cap);
  return token1 + (((liquidity * (b - p) * c) / b) * c) / p / Q96;
}
// The week's published allocation file: per-pool LP budgets and the depth
// reference each budget is scaled against. Its total must match the on-chain
// weekly budget once the rebase/company shares are added back.
function validateBudget(file, week) {
  if (String(week) !== file?.week) throw Error('Budget is not for this epoch');
  for (const key of ['lpBudgets', 'refDepth', 'refTick']) {
    if (!file[key] || typeof file[key] !== 'object' || Array.isArray(file[key]))
      throw Error(`Missing ${key}`);
  }
  let lp = 0n;
  for (const [id, raw] of Object.entries(file.lpBudgets)) {
    if (!/^0x[0-9a-f]{64}$/.test(id)) throw Error('Invalid pool ID');
    const budget = uint(raw);
    lp += budget;
    if (budget > 0n) {
      if (uint(file.refDepth[id]) <= 0n) throw Error('Missing depth reference');
      const ref = file.refTick[id];
      if (
        typeof ref !== 'string' ||
        !/^-?\d{1,6}$/.test(ref) ||
        Math.abs(Number(ref)) > 887272
      )
        throw Error('Invalid reference tick');
    }
  }
  const rebase = uint(file.rebaseBps),
    company = uint(file.companyBps);
  if (
    rebase > 10000n ||
    company > 10000n ||
    (lp * (10000n + rebase + company)) / 10000n !==
      uint(file.weeklyBudgetOnChain)
  )
    throw Error('Inconsistent allocation file');
  return file;
}
const goodPrice = coin =>
  coin &&
  Number.isFinite(coin.price) &&
  coin.price > 0 &&
  Number.isInteger(coin.decimals);
function value(raw, coins) {
  return raw.reduce(
    (sum, n, i) => sum + (Number(n) / 10 ** coins[i].decimals) * coins[i].price,
    0
  );
}

// One staking row per pool. tvlUsd is all staked principal, in or out of
// range. The reward rate is the hourly release (weekly budget / 168, scaled
// down when eligible depth is below the published reference) over in-range
// staked principal: the capital-weighted average over eligible ranges.
function poolRate({ pool, ranges, budget, coins, reward, killed }) {
  if (!coins.every(goodPrice) || !goodPrice(reward)) return null;
  if (!Number.isInteger(pool.tick) || !pool.sqrtPriceX96)
    throw Error('Missing pool price');
  const p = uint(pool.sqrtPriceX96),
    ref = Number(budget.refTick[pool.id]);
  const seen = new Set();
  const rows = ranges.map(r => {
    const key = `${r.tickLower}:${r.tickUpper}`;
    if (seen.has(key)) throw Error('Duplicate range');
    seen.add(key);
    const liquidity = uint(r.totalStaked);
    return {
      depth: depth(liquidity, r.tickLower, r.tickUpper, pool.tick, ref),
      tvlUsd: value(amounts(liquidity, r.tickLower, r.tickUpper, p), coins)
    };
  });
  const tvlUsd = rows.reduce((s, r) => s + r.tvlUsd, 0);
  if (!(tvlUsd > 0) || !Number.isFinite(tvlUsd)) return null;
  const eligible = rows.filter(r => r.depth > 0n);
  const totalDepth = eligible.reduce((s, r) => s + r.depth, 0n);
  const inRangeUsd = eligible.reduce((s, r) => s + r.tvlUsd, 0);
  const reference = uint(budget.refDepth[pool.id]);
  let hourly = killed ? 0n : uint(budget.lpBudgets[pool.id]) / 168n;
  if (totalDepth < reference) hourly = (hourly * totalDepth) / reference;
  const apyReward =
    inRangeUsd > 0
      ? (((Number(hourly) / 1e18) * reward.price * (YEAR / 3600)) /
          inRangeUsd) *
        100
      : 0;
  if (!Number.isFinite(apyReward)) return null;
  return { tvlUsd, inRangeUsd, apyReward, hourly };
}
module.exports = {
  WEEK,
  OFFSET,
  Q96,
  ONE,
  YEAR,
  epochOf,
  sqrtAtTick,
  uint,
  amounts,
  depth,
  validateBudget,
  goodPrice,
  value,
  poolRate
};
