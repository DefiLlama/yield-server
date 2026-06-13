const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

const PROJECT = 'juiceswap';
const CHAIN = 'citrea';
// Ponder indexer — the only source for pool list and 24h swap volume
// (requires on-chain event indexing; no subgraph alternative exists)
const PONDER = 'https://ponder.juiceswap.com/graphql';

const poolsQuery = gql`
  query Pools($chainId: Int!) {
    pools(where: { chainId: $chainId }, limit: 1000) {
      items {
        address
        fee
        token0
        token1
      }
    }
  }
`;

const statsQuery = gql`
  query Stats($chainId: Int!, $from: BigInt!, $to: BigInt!) {
    poolStats(
      where: { chainId: $chainId, type: "24h", timestamp_gte: $from, timestamp_lt: $to }
      limit: 1000
    ) {
      items {
        poolAddress
        volume0
        volume1
      }
    }
  }
`;

const apy = async () => {
  const chainId = 4114;
  const nowSec = Math.floor(Date.now() / 1000);
  const todayUtc = Math.floor(nowSec / 86400) * 86400;
  const yesterdayUtc = todayUtc - 86400;

  // 1. Fetch pool list and yesterday's 24h volume from Ponder
  const [poolsData, statsData] = await Promise.all([
    request(PONDER, poolsQuery, { chainId }),
    request(PONDER, statsQuery, {
      chainId,
      from: yesterdayUtc,
      to: todayUtc,
    }),
  ]);

  const pools = poolsData.pools.items;
  const statsMap = Object.fromEntries(
    statsData.poolStats.items.map((s) => [s.poolAddress.toLowerCase(), s])
  );

  // 2. Fetch token info (symbol, decimals) on-chain
  const uniqueTokens = [
    ...new Set(pools.flatMap((p) => [p.token0.toLowerCase(), p.token1.toLowerCase()])),
  ];

  const [symbolResults, decimalResults] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: uniqueTokens.map((t) => ({ target: t })),
      chain: CHAIN,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: uniqueTokens.map((t) => ({ target: t })),
      chain: CHAIN,
      permitFailure: true,
    }),
  ]);

  const tokenInfo = {};
  uniqueTokens.forEach((token, i) => {
    tokenInfo[token] = {
      symbol: symbolResults.output[i].output || token.slice(0, 8),
      decimals: Number(decimalResults.output[i].output) || 18,
    };
  });

  // 3. Fetch token balances held by each pool (for TVL)
  const balanceCalls = pools.flatMap((p) => [
    { target: p.token0.toLowerCase(), params: [p.address.toLowerCase()] },
    { target: p.token1.toLowerCase(), params: [p.address.toLowerCase()] },
  ]);

  const balanceResults = await sdk.api.abi.multiCall({
    abi: 'erc20:balanceOf',
    calls: balanceCalls,
    chain: CHAIN,
    permitFailure: true,
  });

  pools.forEach((pool, i) => {
    const raw0 = balanceResults.output[i * 2].output;
    const raw1 = balanceResults.output[i * 2 + 1].output;
    pool.reserve0 = raw0
      ? Number(raw0) / 10 ** tokenInfo[pool.token0.toLowerCase()].decimals
      : 0;
    pool.reserve1 = raw1
      ? Number(raw1) / 10 ** tokenInfo[pool.token1.toLowerCase()].decimals
      : 0;
  });

  // 4. Fetch USD prices for all tokens
  const { pricesByAddress } = await utils.getPrices(uniqueTokens, CHAIN);

  // 5. Build result
  return pools
    .map((pool) => {
      const t0 = pool.token0.toLowerCase();
      const t1 = pool.token1.toLowerCase();
      const price0 = pricesByAddress[t0] || 0;
      const price1 = pricesByAddress[t1] || 0;

      let tvlUsd;
      if (price0 && price1) {
        tvlUsd = pool.reserve0 * price0 + pool.reserve1 * price1;
      } else if (price0) {
        tvlUsd = pool.reserve0 * price0 * 2;
      } else if (price1) {
        tvlUsd = pool.reserve1 * price1 * 2;
      } else {
        tvlUsd = 0;
      }

      const stat = statsMap[pool.address.toLowerCase()];
      let apyBase = 0;
      if (stat && tvlUsd > 0) {
        const vol0Usd =
          (Number(stat.volume0) / 10 ** tokenInfo[t0].decimals) * price0;
        const vol1Usd =
          (Number(stat.volume1) / 10 ** tokenInfo[t1].decimals) * price1;
        // Average both sides — each swap appears in both volume0 and volume1
        const volumeUsd24h =
          price0 && price1
            ? (vol0Usd + vol1Usd) / 2
            : vol0Usd || vol1Usd;
        const feeRate = pool.fee / 1e6;
        apyBase = (volumeUsd24h * feeRate / tvlUsd) * 365 * 100;
      }

      const sym0 = tokenInfo[t0].symbol;
      const sym1 = tokenInfo[t1].symbol;

      return {
        pool: `${pool.address}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: `${sym0}-${sym1}`,
        tvlUsd,
        apyBase,
        poolMeta: `${pool.fee / 1e4}%`,
        underlyingTokens: [t0, t1],
        url: `https://juiceswap.com/#/explore/pools/citrea_mainnet/${pool.address}`,
      };
    })
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://juiceswap.com/#/explore/pools',
};
