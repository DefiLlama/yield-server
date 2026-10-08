/**
 * Alpend — DefiLlama yield-server adapter (Canton Network).
 *
 * Reads per-pool rates from CC Tools, the third-party Canton data aggregator DefiLlama's own TVL
 * adapter for Alpend already uses (projects/alpend in DefiLlama-Adapters), so both listings share
 * one source. CC Tools mirrors Alpend's on-chain AssetReserve state: interest accrues on-chain via
 * reserve indices; the rates here are the live per-annum rates of each reserve's interest-rate
 * model, reported flat (not compounded).
 *
 *   apyBase        supply APY from the interest-rate model
 *   apyReward      Canton Coin (CC) reward APY on supplies (Alpend's Ascent programme)
 *   apyBaseBorrow  borrow APY
 *   apyRewardBorrow always 0 — the reward programme is supply-side only
 *   tvlUsd         supplied minus borrowed, the yield-server lending convention
 */
const axios = require('axios');

const FEED_URL = 'https://api.cctools.network/api/markets/alpend/tvl';
const PROJECT = 'alpend';
const CHAIN = 'Canton';
const CC_COINGECKO = 'coingecko:canton-network';
const REQUEST_TIMEOUT_MS = 30_000;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const apy = async () => {
  const { data } = await axios.get(FEED_URL, { timeout: REQUEST_TIMEOUT_MS });
  const pools = Array.isArray(data && data.pools) ? data.pools : [];

  return pools
    .filter((p) => p && p.asset && p.status !== 'inactive')
    .map((p) => {
      const totalSupplyUsd = num(p.totalSuppliedUsd);
      const totalBorrowUsd = num(p.totalBorrowedUsd);
      const apyReward = num(p.apyReward);
      return {
        pool: `alpend-canton-${String(p.asset).toLowerCase()}`,
        chain: CHAIN,
        project: PROJECT,
        symbol: String(p.asset),
        tvlUsd: Math.max(totalSupplyUsd - totalBorrowUsd, 0),
        apyBase: num(p.apyBase),
        apyReward,
        rewardTokens: apyReward > 0 ? [CC_COINGECKO] : [],
        underlyingTokens: p.coingeckoId ? [`coingecko:${p.coingeckoId}`] : [],
        apyBaseBorrow: num(p.apyBaseBorrow),
        apyRewardBorrow: 0,
        totalSupplyUsd,
        totalBorrowUsd,
        url: `https://app.alpend.com/markets/${String(p.asset).toLowerCase()}`,
      };
    })
    .filter((pool) => pool.tvlUsd >= 1);
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.alpend.com',
  protocolId: '8778',
};
