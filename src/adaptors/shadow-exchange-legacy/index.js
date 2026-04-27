const axios = require('axios');
const utils = require('../utils');

const SHADOW = '0x3333b97138D4b086720b5aE8A7844b1345a33333';
const PROJECT = 'shadow-exchange-legacy';
const CHAIN = 'sonic';
const SHADOW_API_URL =
  'https://shadow-api-v2-production.up.railway.app/mixed-pairs?includeTokens=False';

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function apy() {
  try {
    const shadowApiData = await axios.get(SHADOW_API_URL);
    const pairs = Array.isArray(shadowApiData.data?.pairs)
      ? shadowApiData.data.pairs
      : [];

    const pools = pairs
      // Legacy pools do not have a feeTier field; CLMM pools do.
      .filter((p) => p.feeTier === null || p.feeTier === undefined)
      // Keep gauge-based pools only to preserve existing "eligible pool" intent.
      .filter((p) => p.gauge?.id)
      .map((pool) => {
        const poolAddress = pool.id?.toLowerCase();
        const apyReward = toNumber(pool.lpApr);
        const tvlUsd = toNumber(pool.totalValueLockedUSD || pool.tvl);

        return {
          pool: `${poolAddress}-${utils.formatChain(CHAIN)}`.toLowerCase(),
          chain: utils.formatChain(CHAIN),
          project: PROJECT,
          poolMeta: `Legacy V2 ${pool.stable ? 'stable' : 'volatile'}`,
          symbol: pool.symbol || `${pool.symbol0}-${pool.symbol1}`,
          tvlUsd,
          apyBase: 0,
          apyBase7d: 0,
          apyReward,
          rewardTokens: apyReward > 0 ? [SHADOW] : [],
          underlyingTokens: [pool.token0, pool.token1]
            .filter(Boolean)
            .map((token) => token.toLowerCase()),
          url: `https://www.shadow.so/liquidity/${poolAddress}`,
          volumeUsd1d: toNumber(pool.poolDayData?.[0]?.volumeUSD),
          volumeUsd7d: Array.isArray(pool.poolDayData)
            ? pool.poolDayData.reduce(
                (sum, day) => sum + toNumber(day?.volumeUSD),
                0
              )
            : 0,
        };
      })
      .filter((pool) => pool.pool && pool.symbol && pool.underlyingTokens.length >= 2);

    return pools.filter((p) => utils.keepFinite(p));
  } catch (error) {
    console.error('Error fetching Shadow legacy data:', error);
    return [];
  }
}

module.exports = {
  timetravel: false,
  apy,
};
