/**
 * Alpend — DefiLlama yield-server adapter (Canton Network).
 *
 * Reads per-pool rates from CC Tools, the third-party Canton data aggregator DefiLlama's TVL
 * adapter for Alpend already uses (projects/alpend in DefiLlama-Adapters), so both listings share
 * one source. CC Tools mirrors Alpend's on-chain AssetReserve state: interest accrues on-chain via
 * reserve indices; the rates here are the live per-annum rates of each reserve's interest-rate
 * model, reported flat (not compounded).
 *
 *   apyBase        supply APY from the interest-rate model
 *   apyReward      Canton Coin (CC) reward APY on supplies (Alpend's Ascent programme). A headline
 *                  rate per market, capped by a daily CC budget: the feed publishes the EFFECTIVE
 *                  rate, recomputed every snapshot from the oracle CC price and the eligible supply,
 *                  so it equals the headline while the cap has headroom and falls as 1/supply once
 *                  the cap binds.
 *   apyBaseBorrow  borrow APY
 *   apyRewardBorrow always 0 — the reward programme is supply-side only
 *   tvlUsd         supplied minus borrowed, the yield-server lending convention
 *
 * Feed validation (staleness, scaling, null/invalid amounts) mirrors the TVL adapter: a bad feed
 * throws rather than reporting zeros.
 */
const axios = require('axios');

const FEED_URL = 'https://api.cctools.network/api/markets/alpend/tvl';
const FETCH_OPTS = { timeout: 30_000, headers: { 'User-Agent': 'DefiLlama-Adapter (alpend)' } };
const PROJECT = 'alpend';
const CHAIN = 'Canton';
const CC_COINGECKO = 'coingecko:canton-network';

const MAX_SOURCE_AGE_SECONDS = 24 * 60 * 60;

// Same checks as DefiLlama-Adapters/projects/alpend: refuse an empty, unscaled or stale feed.
function validateFeed(feed, caller) {
  if (!feed || !Array.isArray(feed.pools) || feed.pools.length === 0)
    throw new Error(`alpend: CCTools feed returned no pools (${caller})`);
  if (feed.amountsAreScaled !== true)
    throw new Error(`alpend: CCTools feed amounts are not scaled (${caller})`);

  const ageSeconds = Number.isFinite(feed.sourceAgeSeconds)
    ? feed.sourceAgeSeconds
    : (Date.now() - new Date(feed.sourceUpdatedAt).getTime()) / 1000;
  if (!Number.isFinite(ageSeconds) || ageSeconds > MAX_SOURCE_AGE_SECONDS)
    throw new Error(`alpend: CCTools feed is stale (${caller}), age=${ageSeconds}s`);
}

// Same as the TVL adapter: a missing or invalid number is an error, never a silent 0.
function getAmount(pool, field) {
  if (pool[field] === null || pool[field] === undefined || pool[field] === '')
    throw new Error(`alpend: missing ${field} amount for ${pool.asset}`);
  const amount = Number(pool[field]);
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error(`alpend: invalid ${field} amount for ${pool.asset}`);
  return amount;
}

async function getPools(caller) {
  const { data: feed } = await axios.get(FEED_URL, FETCH_OPTS);
  validateFeed(feed, caller);
  return feed.pools.filter((pool) => pool.coingeckoId && pool.status !== 'inactive');
}

const apy = async () => {
  const pools = await getPools('apy');

  return pools.map((p) => {
    const totalSupplyUsd = getAmount(p, 'totalSuppliedUsd');
    const totalBorrowUsd = getAmount(p, 'totalBorrowedUsd');
    if (totalBorrowUsd > totalSupplyUsd)
      throw new Error(`alpend: borrowed exceeds supplied for ${p.asset}`);
    const apyReward = getAmount(p, 'apyReward');
    const symbol = String(p.asset);
    return {
      pool: `alpend-canton-${symbol.toLowerCase()}`,
      chain: CHAIN,
      project: PROJECT,
      symbol,
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase: getAmount(p, 'apyBase'),
      apyReward,
      rewardTokens: apyReward > 0 ? [CC_COINGECKO] : [],
      underlyingTokens: [`coingecko:${p.coingeckoId}`],
      apyBaseBorrow: getAmount(p, 'apyBaseBorrow'),
      apyRewardBorrow: getAmount(p, 'apyRewardBorrow'),
      totalSupplyUsd,
      totalBorrowUsd,
      url: `https://app.alpend.com/markets/${symbol.toLowerCase()}`,
    };
  });
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.alpend.com',
  protocolId: '8778',
};
