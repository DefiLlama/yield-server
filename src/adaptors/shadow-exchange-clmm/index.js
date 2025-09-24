const axios = require('axios');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

const SHADOW = '0x3333b97138D4b086720b5aE8A7844b1345a33333';
const PROJECT = 'shadow-exchange-clmm';
const CHAIN = 'sonic';
const SUBGRAPH = 'https://shadow.kingdomsubgraph.com/subgraphs/name/core-pruned';

const poolsQuery = gql`
  query getPools($first: Int!, $skip: Int!) {
    clPools(
      first: $first
      skip: $skip
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: { gauge_not: null }
    ) {
      id
      token0 {
        id
        symbol
      }
      token1 {
        id
        symbol
      }
      feeTier
      tickSpacing
      totalValueLockedUSD
      gauge {
        id
      }
      poolDayData(first: 7, orderBy: startOfDay, orderDirection: desc) {
        volumeUSD
      }
    }
  }
`;

async function fetchAllPools() {
  let allPools = [];
  let skip = 0;
  const first = 1000;

  while (true) {
    const poolsData = await request(SUBGRAPH, poolsQuery, { first, skip });
    const pools = poolsData.clPools;

    if (pools.length === 0) break;

    allPools = allPools.concat(pools);

    if (pools.length < first) break;

    skip += first;
  }

  return allPools;
}

async function apy() {
  try {
    const pools = await fetchAllPools();

    let shadowPools = [];
    try {
      const shadowApiData = await axios.get('https://shadow-api-v2-production.up.railway.app/mixed-pairs?includeTokens=False');
      if (shadowApiData.data && Array.isArray(shadowApiData.data.pairs)) {
        shadowPools = shadowApiData.data.pairs;
      }
    } catch (error) {
      console.error('Failed to fetch Shadow API data:', error.message);
    }

    const aprMap = {};
    for (const pool of shadowPools) {
      if (pool.id) {
        aprMap[pool.id.toLowerCase()] = {
          lpApr: Number(pool.lpApr) || 0
        };
      }
    }

    const results = [];

    for (const pool of pools) {
      const tvlUsd = Number(pool.totalValueLockedUSD) || 0;

      if (!pool.gauge?.id) continue;

      const poolAddress = pool.id.toLowerCase();
      const apiData = aprMap[poolAddress];

      if (!apiData) continue;

      const apyBase = 0;
      let apyReward = 0;
      const tickSpacing = parseInt(pool.tickSpacing);

      const apiPool = shadowPools.find(p => p.id.toLowerCase() === poolAddress);
      if (apiPool && apiPool.recommendedRangesNew) {
        if (tickSpacing === 1 || tickSpacing === 5) {
          const wideRange = apiPool.recommendedRangesNew.find(range => range.name === 'Wide');
          apyReward = wideRange ? wideRange.lpApr : apiData.lpApr || 0;
        } else {
          const narrowRange = apiPool.recommendedRangesNew.find(range => range.name === 'Narrow');
          apyReward = narrowRange ? narrowRange.lpApr : apiData.lpApr || 0;
        }
      } else {
        apyReward = apiData.lpApr || 0;
      }

      results.push({
        pool: `${poolAddress}-${utils.formatChain(CHAIN)}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        poolMeta: `CL ${(Number(pool.feeTier) / 10000).toFixed(2)}%`,
        symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
        tvlUsd,
        apyBase,
        apyBase7d: 0,
        apyReward,
        rewardTokens: apyReward > 0 ? [SHADOW] : [],
        underlyingTokens: [
          pool.token0.id.toLowerCase(),
          pool.token1.id.toLowerCase()
        ],
        url: `https://www.shadow.so/liquidity/${poolAddress}`,
        volumeUsd1d: pool.poolDayData?.[0]?.volumeUSD
          ? Number(pool.poolDayData[0].volumeUSD)
          : 0,
        volumeUsd7d: pool.poolDayData
          ? pool.poolDayData.reduce((sum, day) => sum + Number(day.volumeUSD || 0), 0)
          : 0,
      });
    }

    return results.filter((p) => utils.keepFinite(p));
    
  } catch (error) {
    console.error('Error fetching Shadow CL data:', error);
    return [];
  }
}

module.exports = {
  timetravel: false,
  apy: apy,
};