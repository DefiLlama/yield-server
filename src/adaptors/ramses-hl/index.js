const axios = require('axios');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

const RAM = '0x555570a286f15ebdfe42b66ede2f724aa1ab5555';
const PROJECT = 'ramses-hl';
const CHAIN = 'hyperliquid';
const SUBGRAPH =
  'https://hyperevm.kingdomsubgraph.com/subgraphs/name/ramses-v3-pruned/';
const GATEWAY_API = 'https://gateway.ramses.xyz/v3/hyperevm/pools';

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
  const pools = await fetchAllPools();

  // Fetch APR data from gateway API (let errors propagate for retry logic)
  const res = await axios.get(GATEWAY_API);
  if (!res.data || !Array.isArray(res.data.pools)) {
    throw new Error('Invalid gateway API response');
  }
  const gatewayPools = res.data.pools;

  const aprMap = {};
  for (const p of gatewayPools) {
    if (p.id) {
      aprMap[p.id.toLowerCase()] = p;
    }
  }

  const results = [];

  for (const pool of pools) {
    const tvlUsd = Number(pool.totalValueLockedUSD) || 0;
    if (!pool.gauge?.id) continue;

    const poolAddress = pool.id.toLowerCase();
    const apiData = aprMap[poolAddress];
    const dayData = pool.poolDayData || [];

    let apyBase = 0;
    let apyReward = 0;

    if (apiData && apiData.recommendedRanges?.length) {
      const tickSpacing = parseInt(pool.tickSpacing);
      // Stable pairs (tight tick spacing) use Wide, volatile use Narrow
      const rangeName =
        tickSpacing === 1 || tickSpacing === 5 ? 'Wide' : 'Narrow';
      const range = apiData.recommendedRanges.find((r) => r.name === rangeName);

      if (range) {
        apyBase = Number(range.feeApr) || 0;
        apyReward = Number(range.rewardApr) || 0;
      } else {
        apyBase = Number(apiData.feeApr) || 0;
        apyReward = Number(apiData.rewardApr) || 0;
      }
    } else if (apiData) {
      apyBase = Number(apiData.feeApr) || 0;
      apyReward = Number(apiData.rewardApr) || 0;
    }

    results.push({
      pool: `${poolAddress}-${utils.formatChain(CHAIN)}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      poolMeta: `CL ${(Number(pool.feeTier) / 10000).toFixed(2)}%`,
      symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: apyReward > 0 ? [RAM] : [],
      underlyingTokens: [
        pool.token0.id.toLowerCase(),
        pool.token1.id.toLowerCase(),
      ],
      url: `https://www.ramses.xyz/liquidity/${poolAddress}?chainId=999`,
      volumeUsd1d: dayData?.[0] ? Number(dayData?.[0]?.volumeUSD) : 0,
      volumeUsd7d: dayData?.reduce(
        (sum, day) => sum + Number(day?.volumeUSD || 0),
        0
      ),
    });
  }

  return results.filter((p) => utils.keepFinite(p));
}

module.exports = {
  timetravel: false,
  apy: apy,
};
