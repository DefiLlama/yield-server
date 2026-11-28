const { request, gql } = require('graphql-request');
const utils = require('../utils');

const PROJECT = 'project-x';
const CHAIN = 'hyperevm';

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_cmbbm2iwckb1b01t39xed236t/subgraphs/uniswap-v3-hyperevm-position/prod/gn';

const LP_FEE_SHARE = 0.86;

const MIN_TVL_USD = 10000;

// nested poolDayData makes paging through all ~4k pools take minutes (and a
// 1000-pool page times out), so page pools without it and fetch day data only
// for the pools that pass the TVL floor
const poolsQuery = gql`
  query getPools($first: Int!, $lastId: String!) {
    pools(first: $first, where: { id_gt: $lastId }, orderBy: id) {
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
      reserve0: totalValueLockedToken0
      reserve1: totalValueLockedToken1
    }
  }
`;

// the newest poolDayData bucket is the current UTC day so far, so annualizing
// it reads near zero after midnight. take the last completed day instead
const dayDataQuery = gql`
  query getDayData($ids: [ID!]!, $date: Int!) {
    pools(first: 1000, where: { id_in: $ids }) {
      id
      poolDayData(where: { date: $date }) {
        volumeToken0
        volumeToken1
      }
    }
  }
`;

async function fetchAllPools() {
  const first = 1000;
  let allPools = [];
  let lastId = '';

  while (true) {
    const { pools } = await request(SUBGRAPH_URL, poolsQuery, {
      first,
      lastId,
    });
    allPools = allPools.concat(pools);
    if (pools.length < first) break;
    lastId = pools[pools.length - 1].id;
  }

  return allPools;
}

async function fetchDayData(ids) {
  const dayData = {};
  const date = (Math.floor(Date.now() / 1000 / 86400) - 1) * 86400;
  for (let i = 0; i < ids.length; i += 100) {
    const { pools } = await request(SUBGRAPH_URL, dayDataQuery, {
      ids: ids.slice(i, i + 100),
      date,
    });
    for (const p of pools) dayData[p.id] = p.poolDayData?.[0];
  }
  return dayData;
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
  // The subgraph's USD fields come from its derivedETH pricing, which is
  // broken (UBTC derivedETH ~216k, WHYPE-UBTC reported at $674M for ~$5M of
  // tokens), so price the token amounts with coins.llama.fi instead.
  // utils.tvl doubles the priced side when one price is missing, which a
  // one-sided concentrated position makes meaningless, so skip those
  const pools = (await utils.tvl(await fetchAllPools(), 'hyperliquid')).filter(
    (p) =>
      p.price0 > 0 &&
      p.price1 > 0 &&
      Number.isFinite(p.totalValueLockedUSD) &&
      p.totalValueLockedUSD >= MIN_TVL_USD
  );

  const dayData = await fetchDayData(pools.map((p) => p.id));

  return pools.map((pool) => {
    const day = dayData[pool.id];
    const tvlUSD = pool.totalValueLockedUSD;
    // same as the subgraph's volumeUSD: average of both swap legs
    const volumeUSD =
      (Number(day?.volumeToken0 || 0) * pool.price0 +
        Number(day?.volumeToken1 || 0) * pool.price1) /
      2;
    const feesUSD = (volumeUSD * Number(pool.feeTier)) / 1e6;

    return {
      pool: pool.id.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
      tvlUsd: tvlUSD,
      apyBase: calculateApyBase(feesUSD, tvlUSD),
      url: `https://www.prjx.com/deposit?tokenA=${pool.token0.id}&tokenB=${pool.token1.id}&fee=${pool.feeTier}`,
      underlyingTokens: [
        pool.token0.id.toLowerCase(),
        pool.token1.id.toLowerCase(),
      ],
      poolMeta: `${Number(pool.feeTier) / 10000}%`,
      volumeUsd1d: volumeUSD,
    };
  });
}

module.exports = {
  protocolId: '6444',
  timetravel: false,
  apy,
};
