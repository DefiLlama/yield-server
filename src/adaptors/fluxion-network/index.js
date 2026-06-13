const { request, gql } = require('graphql-request');
const utils = require('../utils');

const PROJECT = 'fluxion-network';
const CHAIN = 'mantle';

const SUBGRAPH_URL =
  'https://subgraph-api.mantle.xyz/api/public/346c94bd-5254-48f7-b71c-c7fa427ae0a8/subgraphs/uni-v3/v0.0.1/gn';

const poolsQuery = gql`
  query getPools($first: Int!, $skip: Int!) {
    pools(
      first: $first
      skip: $skip
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: { totalValueLockedUSD_gt: "1000" }
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
      totalValueLockedUSD
      volumeUSD
      poolDayData(first: 7, orderBy: date, orderDirection: desc) {
        date
        volumeUSD
      }
    }
  }
`;

async function fetchAllPools() {
  const allPools = [];
  let skip = 0;
  const first = 1000;

  while (true) {
    const { pools } = await request(SUBGRAPH_URL, poolsQuery, { first, skip });
    if (pools.length === 0) break;
    allPools.push(...pools);
    if (pools.length < first) break;
    skip += first;
  }

  return allPools;
}

async function apy() {
  const pools = await fetchAllPools();

  const formatted = pools
    .map((pool) => {
      const tvlUsd = Number(pool.totalValueLockedUSD) || 0;
      if (tvlUsd < 10000) return null;

      const dayData = pool.poolDayData || [];
      const volumeUsd1d = Number(dayData[0]?.volumeUSD) || 0;
      const volumeUsd7d = dayData.reduce(
        (sum, d) => sum + (Number(d.volumeUSD) || 0),
        0
      );

      const feeRate = Number(pool.feeTier) / 1e6;
      const apyBase =
        tvlUsd > 0 ? ((volumeUsd1d * feeRate * 365) / tvlUsd) * 100 : 0;
      const apyBase7d =
        volumeUsd7d > 0 ? ((volumeUsd7d * feeRate * 52) / tvlUsd) * 100 : null;

      return {
        pool: pool.id.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
        tvlUsd,
        apyBase,
        apyBase7d,
        underlyingTokens: [
          pool.token0.id.toLowerCase(),
          pool.token1.id.toLowerCase(),
        ],
        poolMeta: `${Number(pool.feeTier) / 10000}%`,
        url: `https://app.fluxion.network/pool/${pool.id}`,
        volumeUsd1d: volumeUsd1d,
        volumeUsd7d: volumeUsd7d,
      };
    })
    .filter(Boolean);

  return formatted.filter((p) => utils.keepFinite(p));
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.fluxion.network',
};
