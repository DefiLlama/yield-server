const { request, gql } = require('graphql-request');
const utils = require('../utils');

const PROJECT = 'project-x';
const CHAIN = 'hyperevm';

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_cmbbm2iwckb1b01t39xed236t/subgraphs/uniswap-v3-hyperevm-position/prod/gn';

const LP_FEE_SHARE = 0.86;

// GraphQL query for fetching pools from Project X V3 subgraph
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
      poolDayData(first: 1, orderBy: date, orderDirection: desc) {
        date
        volumeUSD
        feesUSD
        tvlUSD
      }
    }
  }
`;

/**
 * Fetch all pools from the subgraph
 */
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

/**
 * Calculate APY from daily fees
 * APY = (daily fees * LP_FEE_SHARE / TVL) * 365 * 100
 * 86% of fees go to LPs
 */
function calculateApyBase(feesUSD, tvlUSD) {
  if (!tvlUSD || tvlUSD <= 0) return 0;
  if (!feesUSD || feesUSD <= 0) return 0;

  // Apply LP fee share (86% of fees go to LPs)
  const lpFeesUSD = feesUSD * LP_FEE_SHARE;
  const dailyFeeRate = lpFeesUSD / tvlUSD;
  const annualizedRate = dailyFeeRate * 365;
  return annualizedRate * 100;
}

async function apy() {
  try {
    const pools = await fetchAllPools();

    const formattedPools = pools
      .map((pool) => {
        const dayData = pool.poolDayData?.[0];
        const feesUSD = Number(dayData?.feesUSD || 0);
        const tvlUSD = Number(dayData?.tvlUSD || pool.totalValueLockedUSD || 0);
        const volumeUSD = Number(dayData?.volumeUSD || 0);

        const apyBase = calculateApyBase(feesUSD, tvlUSD);

        // Skip pools with no TVL or very low TVL
        if (tvlUSD < 10000) return null;

        // Format pool metadata
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
          url: `https://www.prjx.com/deposit?tokenA=${pool.token0.id}&tokenB=${pool.token1.id}&fee=${pool.feeTier}`,
          underlyingTokens: [
            pool.token0.id.toLowerCase(),
            pool.token1.id.toLowerCase(),
          ],
          poolMeta,
          volumeUsd1d: volumeUSD,
        };
      })
      .filter((pool) => pool !== null);

    return formattedPools;
  } catch (error) {
    console.error('Error in Project X adapter:', error);
    throw error;
  }
}

module.exports = {
  timetravel: false,
  apy,
};
