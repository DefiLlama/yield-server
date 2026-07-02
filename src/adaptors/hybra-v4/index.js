const { request, gql } = require('graphql-request');
const utils = require('../utils');

const PROJECT = 'hybra-v4';
const CHAIN = 'hyperliquid';
const HYBR = '0x067b0C72aa4C6Bd3BFEFfF443c536DCd6a25a9C8';
const MIN_TVL_USD = 10000;
// emissions are distributed weekly per ve(3,3) epoch
const EPOCHS_PER_YEAR = 365 / 7;

// Hybra V4 core subgraph (dynamic-fee CL pools, ve(3,3))
const V4_SUBGRAPH =
  'https://api.goldsky.com/api/public/project_cmbj707z4cd9901sib1f6cu0c/subgraphs/hybra-ve33/online/gn';
// gauge staking amounts + weekly HYBR emission per gauge
const GAUGE_SUBGRAPH =
  'https://api.goldsky.com/api/public/project_cmbj707z4cd9901sib1f6cu0c/subgraphs/gauge-tvl/v2-rewards/gn';

const poolsQuery = gql`
  query getPools($first: Int!, $skip: Int!, $minTvl: BigDecimal!) {
    pools(
      first: $first
      skip: $skip
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: { totalValueLockedUSD_gt: $minTvl, gauge_not: null }
    ) {
      id
      tickSpacing
      gauge
      totalValueLockedUSD
      token0 {
        id
        symbol
        decimals
        derivedETH
      }
      token1 {
        id
        symbol
        decimals
        derivedETH
      }
      poolDayData(first: 7, orderBy: date, orderDirection: desc) {
        date
        volumeUSD
      }
    }
  }
`;

const pricesQuery = gql`
  query getPrices($hybr: ID!) {
    bundle(id: "1") {
      ethPriceUSD
    }
    token(id: $hybr) {
      derivedETH
    }
  }
`;

const gaugesQuery = gql`
  query getGauges($first: Int!, $skip: Int!) {
    gauges(first: $first, skip: $skip) {
      id
      pool {
        id
      }
      stakedToken0
      stakedToken1
    }
  }
`;

// one reward entry is emitted per gauge per weekly epoch; grab the recent
// window and keep the latest entry per gauge
const rewardsQuery = gql`
  query getRewards($since: BigInt!) {
    gaugeEpochRewards(
      first: 1000
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_gt: $since }
    ) {
      gauge {
        id
      }
      amount
      timestamp
    }
  }
`;

async function paginate(url, query, key, vars = {}) {
  const all = [];
  const first = 1000;
  let skip = 0;
  while (true) {
    const res = await request(url, query, { first, skip, ...vars });
    const page = res[key];
    if (!page?.length) break;
    all.push(...page);
    if (page.length < first) break;
    skip += first;
  }
  return all;
}

async function apy() {
  const [pools, gauges, priceData] = await Promise.all([
    paginate(V4_SUBGRAPH, poolsQuery, 'pools', {
      minTvl: String(MIN_TVL_USD),
    }),
    paginate(GAUGE_SUBGRAPH, gaugesQuery, 'gauges'),
    request(V4_SUBGRAPH, pricesQuery, { hybr: HYBR.toLowerCase() }),
  ]);

  const ethUsd = Number(priceData.bundle?.ethPriceUSD) || 0;
  const hybrUsd = (Number(priceData.token?.derivedETH) || 0) * ethUsd;

  // latest weekly HYBR emission per gauge (entries are ordered newest first)
  const since = Math.floor(Date.now() / 1000) - 8 * 86400;
  const rewards = (
    await request(GAUGE_SUBGRAPH, rewardsQuery, { since: String(since) })
  ).gaugeEpochRewards;
  const weeklyHybrByGauge = {};
  for (const r of rewards) {
    const g = r.gauge.id.toLowerCase();
    if (weeklyHybrByGauge[g] === undefined)
      weeklyHybrByGauge[g] = Number(r.amount) / 1e18;
  }

  const gaugeByPool = {};
  for (const g of gauges) {
    if (g.pool?.id) gaugeByPool[g.pool.id.toLowerCase()] = g;
  }

  const formatted = pools
    .map((p) => {
      const tvlUsd = Number(p.totalValueLockedUSD);
      if (!Number.isFinite(tvlUsd) || tvlUsd < MIN_TVL_USD) return null;

      const gauge = gaugeByPool[p.id.toLowerCase()];
      const weeklyHybr = weeklyHybrByGauge[(p.gauge || '').toLowerCase()];
      if (!gauge || !weeklyHybr || !hybrUsd) return null;

      // USD value currently staked in the gauge — the emission denominator
      const staked0 =
        (Number(gauge.stakedToken0) / 10 ** Number(p.token0.decimals)) *
        (Number(p.token0.derivedETH) || 0) *
        ethUsd;
      const staked1 =
        (Number(gauge.stakedToken1) / 10 ** Number(p.token1.decimals)) *
        (Number(p.token1.derivedETH) || 0) *
        ethUsd;
      const stakedTvlUsd = staked0 + staked1;
      // avoid absurd APRs on near-empty gauges
      if (!Number.isFinite(stakedTvlUsd) || stakedTvlUsd < 100) return null;

      const apyReward =
        ((weeklyHybr * hybrUsd * EPOCHS_PER_YEAR) / stakedTvlUsd) * 100;

      const days = p.poolDayData || [];
      const volume7d = days.reduce((s, d) => s + (Number(d.volumeUSD) || 0), 0);

      return {
        pool: p.id.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: `${p.token0.symbol}-${p.token1.symbol}`,
        tvlUsd,
        // swap fees accrue to veHYBR voters, not LPs (see the hybra-v4
        // dimension-adapters methodology) — LP yield is gauge emissions only
        apyBase: 0,
        apyReward,
        rewardTokens: [HYBR],
        underlyingTokens: [p.token0.id, p.token1.id],
        poolMeta: 'Dynamic-fee CL',
        url: `https://www.hybra.finance/liquidity/add?token0=${p.token0.id}&token1=${p.token1.id}&type=v3&isDynamicFeePool=${p.tickSpacing}`,
        volumeUsd1d: Number(days[0]?.volumeUSD) || 0,
        volumeUsd7d: volume7d,
      };
    })
    .filter(Boolean);

  return formatted.filter((p) => utils.keepFinite(p));
}

module.exports = {
  protocolId: '6889',
  timetravel: false,
  apy,
  url: 'https://www.hybra.finance',
};
