const { request, gql } = require('graphql-request');
const utils = require('../utils');

// Hyperlynx — Uniswap V3 concentrated-liquidity pools on HyperEVM.
// (V2 pools are well below the display threshold, so only V3 pools are listed.)
const PROJECT = 'hyperlynx';
const CHAIN = 'hyperevm';
const MIN_TVL_USD = 10000;

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_cmg87miatabz301usdo94h2v3/subgraphs/uniswap-v3-hyperevm/prod/gn';

const poolsQuery = gql`
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

async function fetchAllPools() {
  const all = [];
  const first = 1000;
  let skip = 0;
  while (true) {
    const { pools } = await request(SUBGRAPH_URL, poolsQuery, {
      first,
      skip,
      minTvl: String(MIN_TVL_USD),
    });
    if (!pools?.length) break;
    all.push(...pools);
    if (pools.length < first) break;
    skip += first;
  }
  return all;
}

async function apy() {
  const pools = await fetchAllPools();

  return pools
    .map((p) => {
      const days = p.poolDayData || [];
      const day = days[0];
      const tvlUsd = Number(day?.tvlUSD) || Number(p.totalValueLockedUSD);
      if (!Number.isFinite(tvlUsd) || tvlUsd < MIN_TVL_USD) return null;

      // base APY from the latest day's fees; NaN if missing so keepFinite drops it
      const feesUsd = Number(day?.feesUSD);
      const apyBase = Number.isFinite(feesUsd) ? ((feesUsd * 365) / tvlUsd) * 100 : NaN;

      const fees7d = days.reduce((s, d) => s + (Number(d.feesUSD) || 0), 0);
      const volume7d = days.reduce((s, d) => s + (Number(d.volumeUSD) || 0), 0);
      const apyBase7d = days.length
        ? (((fees7d / days.length) * 365) / tvlUsd) * 100
        : NaN;

      const feePercent = Number(p.feeTier) / 10000;
      const token0 = p.token0.id;
      const token1 = p.token1.id;

      return {
        pool: p.id,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: `${p.token0.symbol}-${p.token1.symbol}`,
        tvlUsd,
        apyBase,
        apyBase7d,
        underlyingTokens: [token0, token1],
        poolMeta: `${feePercent}%`,
        url: 'https://hyperlynx.fi/liquidity',
        volumeUsd1d: Number(day?.volumeUSD) || 0,
        volumeUsd7d: volume7d,
      };
    })
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
