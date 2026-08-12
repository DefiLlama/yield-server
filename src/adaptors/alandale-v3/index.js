const { request, gql } = require('graphql-request');
const utils = require('../utils');

const PROJECT = 'alandale-v3';
const CHAIN = 'robinhood';
const URL = 'https://app.alandale.xyz';
const SUBGRAPH =
  'https://api.goldsky.com/api/public/project_cms6oy9216bwr01wahoyxhk79/subgraphs/alandale-cl-mainnet/1.0.0/gn';

const FEE_DENOMINATOR = 1e6;

const poolsQuery = gql`
  {
    pools(first: 1000) {
      id
      fee
      totalValueLockedToken0
      totalValueLockedToken1
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
    }
  }
`;

const hourlyQuery = gql`
  query Hourly($since: Int!) {
    poolHourDatas(
      first: 1000
      where: { periodStartUnix_gte: $since }
      orderBy: periodStartUnix
      orderDirection: desc
    ) {
      pool {
        id
      }
      volumeToken0
      volumeToken1
    }
  }
`;

const apy = async () => {
  const since = Math.floor(Date.now() / 1000) - 86400;
  const [{ pools }, { poolHourDatas }] = await Promise.all([
    request(SUBGRAPH, poolsQuery),
    request(SUBGRAPH, hourlyQuery, { since }),
  ]);

  const volume = {};
  poolHourDatas.forEach((h) => {
    const id = h.pool.id.toLowerCase();
    const cur = volume[id] ?? { token0: 0, token1: 0 };
    cur.token0 += Number(h.volumeToken0) || 0;
    cur.token1 += Number(h.volumeToken1) || 0;
    volume[id] = cur;
  });

  const addresses = [
    ...new Set(pools.flatMap((p) => [p.token0.id.toLowerCase(), p.token1.id.toLowerCase()])),
  ];
  const { pricesByAddress } = await utils.getPrices(addresses, CHAIN);

  return pools
    .map((p) => {
      const t0 = p.token0.id.toLowerCase();
      const t1 = p.token1.id.toLowerCase();
      const price0 = pricesByAddress[t0];
      const price1 = pricesByAddress[t1];
      if (price0 === undefined || price1 === undefined) return null;

      const tvlUsd =
        Number(p.totalValueLockedToken0) * price0 +
        Number(p.totalValueLockedToken1) * price1;
      if (!(tvlUsd > 0)) return null;

      const vol = volume[p.id.toLowerCase()] ?? { token0: 0, token1: 0 };
      const volumeUsd = vol.token0 * price0;
      const feeTier = Number(p.fee) / FEE_DENOMINATOR;
      const apyBase = ((volumeUsd * feeTier * 365) / tvlUsd) * 100;

      return {
        pool: `${p.id}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`),
        tvlUsd,
        apyBase,
        underlyingTokens: [p.token0.id, p.token1.id],
        token: p.id,
        url: `${URL}/pools/${p.id}`,
      };
    })
    .filter(Boolean);
};

module.exports = {
  protocolId: '8400',
  timetravel: false,
  apy,
  url: `${URL}/pools`,
};
