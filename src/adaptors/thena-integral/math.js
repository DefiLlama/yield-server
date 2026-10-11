const YEAR = 365 * 86400;

function latestFarmings(farmings) {
  const result = new Map();
  for (const f of farmings) {
    const previous = result.get(f.pool);
    if (!previous || BigInt(f.nonce) > BigInt(previous.nonce))
      result.set(f.pool, f);
  }
  return result;
}

function feeApr(pool, prior, tvl, elapsed, priorTimestamp) {
  const numeric = (v) => (v == null || v === '' ? NaN : Number(v));
  // A missing historical record is zero only for a pool created inside the window.
  if (!prior && !(numeric(pool.createdAtTimestamp) > priorTimestamp))
    return undefined;
  const fees = numeric(pool.feesUSD) - (prior ? numeric(prior.feesUSD) : 0);
  const shares = [
    pool.communityFee0,
    pool.communityFee1,
    prior ? prior.communityFee0 : pool.communityFee0,
    prior ? prior.communityFee1 : pool.communityFee1,
  ].map(numeric);
  if (
    shares.some((s) => !Number.isFinite(s) || s < 0 || s > 1000) ||
    !Number.isFinite(fees) ||
    fees < 0 ||
    !(tvl > 0) ||
    !(elapsed > 0)
  )
    return undefined;
  // Community fees are in thousandths. Use the larger observed share to avoid
  // assigning protocol/voter revenue to LPs, including asymmetric token fees.
  const apr =
    ((fees * (1 - Math.max(...shares) / 1000) * YEAR) / elapsed / tvl) * 100;
  return Number.isFinite(apr) ? apr : undefined;
}

function rewardApr(farm, timestamp, tvl, price) {
  if (!farm) return { apr: 0, tokens: [] };
  if (farm.isDeactivated || farm.deactivated === true)
    return { apr: 0, tokens: [] };
  if (
    farm.deactivated !== false ||
    !farm.rates ||
    !farm.reserves ||
    farm.prevTimestamp == null ||
    farm.liquidity == null ||
    farm.incentive == null
  )
    return undefined;
  if (farm.incentive.toLowerCase() !== farm.virtualPool.toLowerCase())
    return { apr: 0, tokens: [] };
  const elapsed = timestamp - Number(farm.prevTimestamp);
  if (!Number.isFinite(elapsed) || elapsed < 0 || !(tvl > 0)) return undefined;
  let annualUsd = 0;
  const tokens = new Set();
  for (const [i, token] of [
    farm.rewardToken,
    farm.bonusRewardToken,
  ].entries()) {
    const rate = BigInt(farm.rates[i]);
    const reserve = BigInt(farm.reserves[i]);
    // Reserves are lazy-updated: subtract accrual since the last virtual-pool
    // update before deciding whether its advertised rate is still funded.
    const accrued = BigInt(farm.liquidity) > 0n ? rate * BigInt(elapsed) : 0n;
    if (rate === 0n || reserve <= accrued) continue;
    const quote = price(token);
    if (!quote || !Number.isInteger(quote.decimals) || quote.decimals < 0)
      return undefined;
    annualUsd += (Number(rate) / 10 ** quote.decimals) * quote.price * YEAR;
    tokens.add(token);
  }
  const apr = (annualUsd / tvl) * 100;
  return Number.isFinite(apr) ? { apr, tokens: [...tokens] } : undefined;
}

module.exports = { feeApr, rewardApr, latestFarmings };
