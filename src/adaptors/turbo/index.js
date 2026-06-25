const { request, gql } = require('graphql-request');
const utils = require('../utils');

const PROJECT = 'turbo';
const CHAIN = 'hyperevm';
const MIN_TVL_USD = 10000;

// Turbo is a Uniswap V3 DEX on HyperEVM (chain 999). Pool TVL and daily fees
// come from Turbo's on-chain factory indexer subgraph; base APY is the standard
// fees * 365 / TVL, matching how other HyperEVM V3 DEXes are measured.
const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_cmnqchkq69xed01u0azgqedfi/subgraphs/v3-factory-indexer/4.1.0/gn';

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
      token0
      token1
      token0Symbol
      token1Symbol
      fee
      totalValueLockedUSD
      poolDayData(first: 7, orderBy: dayStartUnix, orderDirection: desc) {
        dayStartUnix
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

      // latest full day's fees, annualized over the pool's TVL
      const feesUsd = Number(day?.feesUSD);
      const apyBase = Number.isFinite(feesUsd) ? (feesUsd * 365) / tvlUsd * 100 : NaN;

      const fees7d = days.reduce((s, d) => s + (Number(d.feesUSD) || 0), 0);
      const apyBase7d = days.length
        ? ((fees7d / days.length) * 365) / tvlUsd * 100
        : NaN;

      return {
        pool: `${p.id}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: `${p.token0Symbol}-${p.token1Symbol}`,
        tvlUsd,
        apyBase,
        apyBase7d,
        underlyingTokens: [p.token0, p.token1],
        poolMeta: `${Number(p.fee) / 10000}%`,
        url: 'https://turbotrade.app',
      };
    })
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p));
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://turbotrade.app',
};
