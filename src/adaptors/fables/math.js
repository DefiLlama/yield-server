const WEEK = 604800;
const OFFSET = 432000; // Tuesday 00:00 UTC
const Q96 = 1n << 96n;
const ONE = 10n ** 18n;
const YEAR = 52 * WEEK; // Same 364-day annualization as the app's staking APR.
const epochOf = (timestamp) => Math.floor((timestamp - OFFSET) / WEEK);

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
  0x48a170391f7dc42444e8fa2n,
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
function amounts(liquidity, lower, upper, sqrtPrice) {
  const a = sqrtAtTick(lower),
    b = sqrtAtTick(upper);
  if (a >= b || sqrtPrice <= 0n || liquidity < 0n) throw Error('Invalid range');
  const p = sqrtPrice < a ? a : sqrtPrice > b ? b : sqrtPrice;
  return [(liquidity * (b - p) * Q96) / b / p, (liquidity * (p - a)) / Q96];
}
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
function validateBudget(file, timestamp) {
  if (String(epochOf(timestamp)) !== file?.week)
    throw Error('Budget is not for the current epoch');
  for (const key of ['lpBudgets', 'refDepth', 'refTick']) {
    if (!file[key] || typeof file[key] !== 'object' || Array.isArray(file[key]))
      throw Error(`Missing ${key}`);
  }
  for (const [id, raw] of Object.entries(file.lpBudgets)) {
    if (!/^0x[0-9a-f]{64}$/.test(id)) throw Error('Invalid pool ID');
    const budget = uint(raw);
    if (budget > 0n) {
      if (uint(file.refDepth[id]) <= 0n)
        throw Error('Missing positive depth reference');
      const ref = file.refTick[id];
      if (
        typeof ref !== 'string' ||
        !/^-?\d{1,6}$/.test(ref) ||
        Math.abs(Number(ref)) > 887272
      )
        throw Error('Invalid reference tick');
    }
  }
  for (const weights of Object.values(file.rhythm ?? {})) {
    if (!Array.isArray(weights) || weights.length !== 168)
      throw Error('Invalid rhythm length');
    let sum = 0n;
    weights.forEach((w, h) => {
      sum += uint(w);
      if (sum * 168n > BigInt(h + 1) * ONE) throw Error('Front-loaded rhythm');
    });
    if (sum !== ONE) throw Error('Invalid rhythm sum');
  }
  const lp = Object.values(file.lpBudgets).reduce((s, b) => s + uint(b), 0n);
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
function releasePerHour(file, id, timestamp) {
  const budget = uint(file.lpBudgets[id]);
  const profile = file.rhythm?.[id];
  if (!profile) return budget / 168n;
  const hour = Math.floor(
    (timestamp - (epochOf(timestamp) * WEEK + OFFSET)) / 3600
  );
  return (budget * uint(profile[hour])) / ONE;
}
function goodPrice(coin, timestamp) {
  return (
    coin &&
    Number.isFinite(coin.price) &&
    coin.price > 0 &&
    Number.isInteger(coin.decimals) &&
    coin.decimals >= 0 &&
    coin.decimals <= 36 &&
    Number.isFinite(coin.timestamp) &&
    timestamp - coin.timestamp >= -300 &&
    timestamp - coin.timestamp <= 10800 &&
    Number.isFinite(coin.confidence) &&
    coin.confidence >= 0.5
  );
}
function value(raw, coins) {
  return raw.reduce(
    (sum, n, i) => sum + (Number(n) / 10 ** coins[i].decimals) * coins[i].price,
    0
  );
}

// Range accounting supplies the depth and principal for ONE staking pool row.
// TVL includes out-of-range stake; the APR denominator includes eligible stake.
function poolRate({ pool, ranges, budget, coins, reward, timestamp, killed }) {
  if (
    !coins.every((c) => goodPrice(c, timestamp)) ||
    !goodPrice(reward, timestamp)
  )
    return null;
  if (!Number.isInteger(pool.tick) || !pool.sqrtPriceX96)
    throw Error('Missing pool price');
  const p = uint(pool.sqrtPriceX96),
    ref = Number(budget.refTick[pool.id]);
  const seen = new Set();
  const rows = ranges.map((r) => {
    const key = `${r.tickLower}:${r.tickUpper}`;
    if (seen.has(key)) throw Error('Duplicate range');
    seen.add(key);
    const liquidity = uint(r.totalStaked);
    const d = depth(liquidity, r.tickLower, r.tickUpper, pool.tick, ref);
    return {
      ...r,
      liquidity,
      depth: d,
      tvlUsd: value(amounts(liquidity, r.tickLower, r.tickUpper, p), coins),
    };
  });
  const eligible = rows.filter((r) => r.depth > 0n);
  const totalLiquidity = eligible.reduce((s, r) => s + r.liquidity, 0n);
  const totalDepth = eligible.reduce((s, r) => s + r.depth, 0n);
  const reference = uint(budget.refDepth[pool.id]);
  let hourly = killed ? 0n : releasePerHour(budget, pool.id, timestamp);
  if (totalDepth < reference) hourly = (hourly * totalDepth) / reference;
  const tvlUsd = rows.reduce((s, r) => s + r.tvlUsd, 0);
  const inRangeUsd = eligible.reduce((s, r) => s + r.tvlUsd, 0);
  if (!(tvlUsd > 0) || !Number.isFinite(tvlUsd)) return null;
  const apyReward =
    inRangeUsd > 0
      ? (((Number(hourly) / 1e18) * reward.price * (YEAR / 3600)) /
          inRangeUsd) *
        100
      : 0;
  if (!Number.isFinite(apyReward)) return null;
  return {
    tvlUsd,
    inRangeUsd,
    apyReward,
    hourlyFables: String(hourly),
    totalDepth: String(totalDepth),
    totalLiquidity: String(totalLiquidity),
    ranges: rows.filter((r) => r.liquidity > 0n && r.tvlUsd > 0),
  };
}

// Internal allocation check, not additional output rows. Settlement floors per
// owner; this aggregate-range split is only a fixed-input accounting reference.
function rates(args) {
  const pool = poolRate(args);
  if (!pool) return [];
  const hourly = BigInt(pool.hourlyFables);
  const totalLiquidity = BigInt(pool.totalLiquidity);
  return pool.ranges
    .map((r) => {
      const emitted =
        r.depth > 0n && totalLiquidity > 0n
          ? (hourly * r.liquidity) / totalLiquidity
          : 0n;
      return {
        ...r,
        hourlyFables: String(emitted),
        totalDepth: pool.totalDepth,
        totalLiquidity: pool.totalLiquidity,
        apyReward:
          (((Number(emitted) / 1e18) * args.reward.price * (YEAR / 3600)) /
            r.tvlUsd) *
          100,
      };
    })
    .filter((r) => Number.isFinite(r.apyReward));
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
  releasePerHour,
  goodPrice,
  value,
  poolRate,
  rates,
};
