const axios = require('axios');

const V4_POOLS_API =
  'https://api.sparkdex.ai/dex/v4/pools?chainId=14&dex=SparkDEX';
const rFLR = '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e'; // Reward FLR
const CHAIN = 'flare';

// aprs[].type from API
const AprTypeId = {
  FEE: 0,
  RFLR: 1,
  DINERO: 2,
  PICO: 3,
  BUGO: 4,
  SPRK: 5,
  DELEGATION: 6,
  CUSDX: 7,
};

const calculateApy = (_apr) => {
  const APR = _apr / 100;
  const n = 365;
  const APY = (1 + APR / n) ** n - 1;
  return APY * 100;
};

/**
 * Pick the source (pool or vault) with the highest total APR for this pool.
 * Pool apr = native pool APR; vaults = steer, ichi, etc. Final APR = max(pool, ...vaults).
 */
function getBestAprSource(pool) {
  const poolApr = typeof pool.apr === 'number' ? pool.apr : 0;
  const vaults = pool.vaults || [];
  const maxVaultApr =
    vaults.length > 0
      ? Math.max(...vaults.map((v) => (typeof v.apr === 'number' ? v.apr : 0)))
      : 0;
  if (poolApr >= maxVaultApr) return pool;
  const bestVault = vaults.reduce((best, v) =>
    (v.apr || 0) > (best.apr || 0) ? v : best
  );
  return bestVault;
}

const apy = async () => {
  const response = await axios.get(V4_POOLS_API);
  // V4 API returns [{ chain: 14, data: [ pool1, pool2, ... ] }]
  const chainData = Array.isArray(response.data) ? response.data[0] : null;
  if (!chainData || !chainData.data) return [];

  const pools = chainData.data.filter(
    (item) => item.token0 && item.token1
  );

  const result = pools
    .map((lp) => {
      const tvlUsd = lp.tvlUSD;
      if (!tvlUsd || tvlUsd <= 0) return null;

      // Final APR = highest among native pool APR and all vault APRs
      const best = getBestAprSource(lp);
      const aprs = best.aprs || [];

      const feeApr = aprs
        .filter((a) => a.type === AprTypeId.FEE)
        .reduce((s, a) => s + (a.apr || 0), 0);
      const rflrApr = aprs
        .filter((a) => a.type === AprTypeId.RFLR)
        .reduce((s, a) => s + (a.apr || 0), 0);
      const otherRewardApr = aprs
        .filter(
          (a) =>
            a.type !== AprTypeId.FEE && a.type !== AprTypeId.RFLR
        )
        .reduce((s, a) => s + (a.apr || 0), 0);

      const apyBase = calculateApy(feeApr);
      const rflrApy = calculateApy(rflrApr);
      const otherRewardApy = calculateApy(otherRewardApr);
      // RFLR (type 1): 50% penalty as in v3.1
      const apyReward =
        otherRewardApy + (rflrApy > 0 ? rflrApy / 2 : 0);

      const poolMeta = {
        pool: `${lp.id}-${CHAIN}`.toLowerCase(),
        symbol: `${lp.token0.symbol}-${lp.token1.symbol}`,
        project: 'sparkdex-v4',
        chain: CHAIN,
        tvlUsd,
        apyBase,
        underlyingTokens: [lp.token0.id, lp.token1.id],
      };
      if (apyReward > 0) {
        poolMeta.apyReward = apyReward;
        poolMeta.rewardTokens = [rFLR];
      }
      return poolMeta;
    })
    .filter(Boolean);

  return result;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://sparkdex.ai/pool',
};
