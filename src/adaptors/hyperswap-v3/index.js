const axios = require('axios');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

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
      poolDayData(first: 1, orderBy: date, orderDirection: desc) {
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

function calculateApyBase(feesUSD, tvlUSD) {
  if (!tvlUSD || tvlUSD <= 0) return 0;
  if (!feesUSD || feesUSD <= 0) return 0;

  const dailyFeeRate = feesUSD / tvlUSD;
  const annualizedRate = dailyFeeRate * 365;
  return annualizedRate * 100;
}

async function apy() {
  try {
    const pools = await fetchAllPools();

    const tokenAddresses = new Set();
    pools.forEach((pool) => {
      tokenAddresses.add(`${CHAIN}:${pool.token0.id.toLowerCase()}`);
      tokenAddresses.add(`${CHAIN}:${pool.token1.id.toLowerCase()}`);
    });

    const prices = await utils.getPrices(Array.from(tokenAddresses));

    const formattedPools = pools
      .map((pool) => {
        // Get 24h data if available
        const dayData = pool.poolDayData?.[0];
        const feesUSD = Number(dayData?.feesUSD) || 0;
        const tvlUSD =
          Number(dayData?.tvlUSD) || Number(pool.totalValueLockedUSD) || 0;

        const apyBase = calculateApyBase(feesUSD, tvlUSD);

        if (tvlUSD < 10000) return null;

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
          underlyingTokens: [
            pool.token0.id.toLowerCase(),
            pool.token1.id.toLowerCase(),
          ],
          poolMeta,
          url: `https://app.hyperswap.exchange/#/pools/${pool.id}`,
          volumeUsd1d: dayData?.volumeUSD || 0,
        };
      })
      .filter((pool) => pool !== null);

    return formattedPools;
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

