const { request, gql } = require('graphql-request');
const utils = require('../utils');

// Hyperlynx — Uniswap V3 (concentrated) + V2 (standard) pools on HyperEVM.
const PROJECT = 'hyperlynx';
const CHAIN = 'hyperevm';
const MIN_TVL_USD = 10000;
const V2_FEE = 0.003; // flat 0.3% swap fee on V2 pairs

const V3_SUBGRAPH =
  'https://api.goldsky.com/api/public/project_cmg87miatabz301usdo94h2v3/subgraphs/uniswap-v3-hyperevm/prod/gn';
const V2_SUBGRAPH =
  'https://api.goldsky.com/api/public/project_cmg87miatabz301usdo94h2v3/subgraphs/uniswap-v2-hyperevm/prod/gn';

const v3PoolsQuery = gql`
  query getPools($first: Int!, $skip: Int!, $minTvl: BigDecimal!) {
    pools(
      first: $first
      skip: $skip
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: { totalValueLockedUSD_gt: $minTvl }
    ) {
      id
      token0 { id symbol decimals }
      token1 { id symbol decimals }
      feeTier
      totalValueLockedUSD
      poolDayData(first: 7, orderBy: date, orderDirection: desc) {
        date
        volumeUSD
        feesUSD
        tvlUSD
      }
    }
  }
`;

const v2PairsQuery = gql`
  query getPairs($first: Int!, $skip: Int!, $minTvl: BigDecimal!) {
    pairs(
      first: $first
      skip: $skip
      orderBy: reserveUSD
      orderDirection: desc
      where: { reserveUSD_gt: $minTvl }
    ) {
      id
      token0 { id symbol }
      token1 { id symbol }
      reserveUSD
      pairDayData(first: 7, orderBy: date, orderDirection: desc) {
        date
        dailyVolumeUSD
        reserveUSD
      }
    }
  }
`;

async function fetchAll(url, query, key) {
  const all = [];
  const first = 1000;
  let skip = 0;
  while (true) {
    const res = await request(url, query, { first, skip, minTvl: String(MIN_TVL_USD) });
    const rows = res[key];
    if (!rows?.length) break;
    all.push(...rows);
    if (rows.length < first) break;
    skip += first;
  }
  return all;
}

function v3Pool(p) {
  const days = p.poolDayData || [];
  const day = days[0];
  const tvlUsd = Number(day?.tvlUSD) || Number(p.totalValueLockedUSD);
  if (!Number.isFinite(tvlUsd) || tvlUsd < MIN_TVL_USD) return null;

  const feesUsd = Number(day?.feesUSD);
  const apyBase = Number.isFinite(feesUsd) ? ((feesUsd * 365) / tvlUsd) * 100 : NaN;

  const fees7d = days.reduce((s, d) => s + (Number(d.feesUSD) || 0), 0);
  const volume7d = days.reduce((s, d) => s + (Number(d.volumeUSD) || 0), 0);
  const apyBase7d = days.length ? (((fees7d / days.length) * 365) / tvlUsd) * 100 : NaN;

  return {
    pool: p.id,
    chain: utils.formatChain(CHAIN),
    project: PROJECT,
    symbol: `${p.token0.symbol}-${p.token1.symbol}`,
    tvlUsd,
    apyBase,
    apyBase7d,
    underlyingTokens: [p.token0.id, p.token1.id],
    poolMeta: `${Number(p.feeTier) / 10000}% (V3)`,
    url: 'https://hyperlynx.fi/liquidity',
    volumeUsd1d: Number(day?.volumeUSD) || 0,
    volumeUsd7d: volume7d,
  };
}

function v2Pool(p) {
  const days = p.pairDayData || [];
  const day = days[0];
  const tvlUsd = Number(day?.reserveUSD) || Number(p.reserveUSD);
  if (!Number.isFinite(tvlUsd) || tvlUsd < MIN_TVL_USD) return null;

  const vol1d = Number(day?.dailyVolumeUSD);
  const apyBase = Number.isFinite(vol1d) ? ((vol1d * V2_FEE * 365) / tvlUsd) * 100 : NaN;

  const volume7d = days.reduce((s, d) => s + (Number(d.dailyVolumeUSD) || 0), 0);
  const apyBase7d = days.length
    ? (((volume7d / days.length) * V2_FEE * 365) / tvlUsd) * 100
    : NaN;

  return {
    pool: p.id,
    chain: utils.formatChain(CHAIN),
    project: PROJECT,
    symbol: `${p.token0.symbol}-${p.token1.symbol}`,
    tvlUsd,
    apyBase,
    apyBase7d,
    underlyingTokens: [p.token0.id, p.token1.id],
    poolMeta: '0.3% (V2)',
    url: 'https://hyperlynx.fi/liquidity',
    volumeUsd1d: Number.isFinite(vol1d) ? vol1d : 0,
    volumeUsd7d: volume7d,
  };
}

async function apy() {
  const [v3, v2] = await Promise.all([
    fetchAll(V3_SUBGRAPH, v3PoolsQuery, 'pools'),
    fetchAll(V2_SUBGRAPH, v2PairsQuery, 'pairs'),
  ]);

  return [...v3.map(v3Pool), ...v2.map(v2Pool)]
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p));
}

module.exports = {
  // TODO: set to hyperlynx's protocol id from https://api.llama.fi/protocols
  // (assigned once the TVL adapter PR #19821 merges) before marking this PR ready.
  protocolId: 'TODO',
  timetravel: false,
  apy,
  url: 'https://hyperlynx.fi',
};
