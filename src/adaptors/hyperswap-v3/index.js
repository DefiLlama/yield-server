const { request, gql } = require('graphql-request');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'hyperswap-v3';
const CHAIN = 'hyperevm';

// HyperSwap V3 subgraph on Goldsky
const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_cm97l77ib0cz601wlgi9wb0ec/subgraphs/v3-subgraph/6.0.0/gn';

const poolsQuery = gql`
  query getPools($first: Int!, $skip: Int!) {
    pools(
      first: $first
      skip: $skip
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: { totalValueLockedUSD_gt: 1000 }
    ) {
      id
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      feeTier
      liquidity
      sqrtPrice
      tick
      totalValueLockedUSD
      totalValueLockedToken0
      totalValueLockedToken1
      volumeUSD
      feesUSD
      poolDayData(first: 7, orderBy: date, orderDirection: desc) {
        date
        volumeUSD
        feesUSD
        tvlUSD
      }
    }
  }
`;

async function fetchAllPools() {
  let allPools = [];
  let skip = 0;
  const first = 1000;

  while (true) {
    try {
      const poolsData = await request(SUBGRAPH_URL, poolsQuery, {
        first,
        skip,
      });
      const pools = poolsData.pools;

      if (pools.length === 0) break;

      allPools = allPools.concat(pools);

      if (pools.length < first) break;

      skip += first;
    } catch (error) {
      console.error('Error fetching pools from subgraph:', error);
      throw error;
    }
  }

  return allPools;
}

function calculateApyBase(volumeUSD1d, feeTier, tvlUSD) {
  if (!tvlUSD || tvlUSD <= 0) return 0;
  if (!volumeUSD1d || volumeUSD1d <= 0) return 0;

  const feeUSD1d = (volumeUSD1d * Number(feeTier)) / 1e6;
  const apyBase = (feeUSD1d * 365 / tvlUSD) * 100;
  return apyBase;
}

async function apy() {
  try {
    const pools = await fetchAllPools();

    const formattedPools = pools
      .map((pool) => {
        const tvlUSD = Number(pool.totalValueLockedUSD) || 0;

        if (tvlUSD < 10000) return null;

        const dayData = pool.poolDayData?.[0];
        const volumeUSD1d = Number(dayData?.volumeUSD) || 0;

        const volumeUSD7d = pool.poolDayData
          ? pool.poolDayData.reduce(
              (sum, day) => sum + Number(day.volumeUSD || 0),
              0
            )
          : 0;

        const apyBase = calculateApyBase(volumeUSD1d, pool.feeTier, tvlUSD);

        const apyBase7d =
          volumeUSD7d > 0
            ? ((volumeUSD7d * Number(pool.feeTier)) / 1e6 / tvlUSD) * 52 * 100
            : null;

        const feePercent = Number(pool.feeTier) / 10000;
        const poolMeta = `${feePercent}%`;

        return {
          pool: pool.id.toLowerCase(),
          chain: utils.formatChain(CHAIN),
          project: PROJECT,
          symbol: utils.formatSymbol(
            `${pool.token0.symbol}-${pool.token1.symbol}`
          ),
          tvlUsd: tvlUSD,
          apyBase: apyBase || 0,
          apyBase7d: apyBase7d,
          underlyingTokens: [
            pool.token0.id.toLowerCase(),
            pool.token1.id.toLowerCase(),
          ],
          poolMeta,
          url: `https://app.hyperswap.exchange/#/pools/${pool.id}`,
          volumeUsd1d: volumeUSD1d,
          volumeUsd7d: volumeUSD7d,
        };
      })
      .filter((pool) => pool !== null);

    // Add Merkl reward APY (xSWAP incentive campaigns)
    const poolsWithRewards = await addMerklRewardApy(
      formattedPools,
      'hyperswap'
    );

    return poolsWithRewards.filter((p) => utils.keepFinite(p));
  } catch (error) {
    console.error('Error in HyperSwap V3 adapter:', error);
    throw error;
  }
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.hyperswap.exchange',
};

