const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'fluxion-network';
const CHAIN = 'mantle';
const SDK_CHAIN = 'mantle';

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
      poolDayData(first: 8, orderBy: date, orderDirection: desc) {
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

// with the fee switch on, the pool sends 1/feeProtocol of each swap fee to the
// protocol, so lps only earn the rest. token0's cut is the low nibble, token1's
// the high one; take the larger, as uniswap-v3 does. a pool whose slot0 read
// fails gets null, so it is dropped rather than shown at the gross fee
const getLpFeeShares = async (poolIds) => {
  const { output } = await sdk.api.abi.multiCall({
    abi: 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    calls: poolIds.map((target) => ({ target })),
    chain: SDK_CHAIN,
    permitFailure: true,
  });
  const share = (n) => (n ? 1 / n : 0);
  return output.map(({ output: slot0 }) => {
    if (!slot0) return null;
    const feeProtocol = Number(slot0.feeProtocol);
    return 1 - Math.max(share(feeProtocol & 0xf), share(feeProtocol >> 4));
  });
};

async function apy() {
  const pools = await fetchAllPools();
  const today = Math.floor(Date.now() / 1000 / 86400) * 86400;

  let formatted = pools
    .map((pool) => {
      const tvlUsd = Number(pool.totalValueLockedUSD) || 0;
      if (tvlUsd < 10000) return null;

      const dayData = (pool.poolDayData || []).filter(
        (d) => d.date < today && d.date >= today - 7 * 86400
      );
      const volumeUsd1d =
        Number(dayData.find((d) => d.date === today - 86400)?.volumeUSD) || 0;
      const volumeUsd7d = dayData.reduce(
        (sum, d) => sum + (Number(d.volumeUSD) || 0),
        0
      );

      const feeRate = Number(pool.feeTier) / 1e6;
      const apyBase =
        tvlUsd > 0 ? ((volumeUsd1d * feeRate * 365) / tvlUsd) * 100 : 0;
      const apyBase7d = ((volumeUsd7d * feeRate * 52) / tvlUsd) * 100;

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

  const lpFeeShares = await getLpFeeShares(formatted.map((p) => p.pool));
  formatted = formatted
    .map((p, i) =>
      lpFeeShares[i] === null
        ? null
        : {
            ...p,
            apyBase: p.apyBase * lpFeeShares[i],
            apyBase7d: p.apyBase7d * lpFeeShares[i],
          }
    )
    .filter(Boolean);

  return formatted.filter((p) => utils.keepFinite(p));
}

module.exports = {
  protocolId: '7212',
  timetravel: false,
  apy,
  url: 'https://app.fluxion.network',
};
