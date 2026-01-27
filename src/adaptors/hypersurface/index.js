const { request, gql } = require('graphql-request');
const utils = require('../utils');

// Hypersurface Protocol - DeFi Structured Products Platform
// Website: https://hypersurface.io
// Options vaults (HedgedPool) that earn yield from options market-making

const SUBGRAPH_URLS = {
  hyperliquid:
    'https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-sh-subgraph/latest/gn',
  base:
    'https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-base-subgraph/latest/gn',
};

// Query to get pool info and latest deposit round (contains TVL and price data)
const POOL_QUERY = gql`
  query getPoolData {
    pools(first: 10) {
      id
      tokenName
      tokenSymbol
      collateralAsset {
        id
        symbol
        decimals
      }
    }
    currentRound: depositRounds(
      first: 1
      orderBy: createdTimestamp
      orderDirection: desc
      where: { pricePerShare_not: null, lpSharesSupply_not: null }
    ) {
      id
      pricePerShare
      lpSharesSupply
      createdTimestamp
      pool {
        id
      }
    }
    firstRound: depositRounds(
      first: 1
      orderBy: createdTimestamp
      orderDirection: asc
      where: { pricePerShare_not: null }
    ) {
      id
      pricePerShare
      createdTimestamp
      pool {
        id
      }
    }
    thirtyDaysAgo: depositRounds(
      first: 1
      orderBy: createdTimestamp
      orderDirection: desc
      where: { pricePerShare_not: null }
    ) {
      id
      pricePerShare
      createdTimestamp
      pool {
        id
      }
    }
  }
`;

// Calculate APY from price changes over time
// Formula: APY = ((currentPrice / previousPrice) ^ (365 / days)) - 1
const calculateAPY = (currentPrice, previousPrice, daysBetween) => {
  if (daysBetween <= 0 || previousPrice <= 0 || currentPrice <= 0) {
    return 0;
  }
  const ratio = currentPrice / previousPrice;
  if (ratio <= 0) return 0;
  const apy = Math.pow(ratio, 365 / daysBetween) - 1;
  return apy * 100; // Convert to percentage
};

const fetchChainPools = async (chain, subgraphUrl) => {
  const data = await request(subgraphUrl, POOL_QUERY);

  if (!data.pools || data.pools.length === 0) {
    return [];
  }

  const pools = [];

  for (const pool of data.pools) {
    // Find matching deposit round data
    const currentRound = data.currentRound?.find(
      (r) => r.pool.id === pool.id
    );

    if (!currentRound) continue;

    const firstRound = data.firstRound?.find((r) => r.pool.id === pool.id);

    // Calculate TVL: lpSharesSupply * pricePerShare / (10^8 * 10^collateralDecimals)
    // pricePerShare has 8 decimals, lpSharesSupply reflects collateral decimals
    const lpSharesSupply = Number(currentRound.lpSharesSupply);
    const pricePerShare = Number(currentRound.pricePerShare);
    const collateralDecimals = pool.collateralAsset.decimals;

    // TVL = (lpSharesSupply * pricePerShare / 1e8) / 10^collateralDecimals
    const tvlUsd =
      (lpSharesSupply * pricePerShare) /
      Math.pow(10, 8) /
      Math.pow(10, collateralDecimals);

    // Calculate APY from pricePerShare changes
    let apyBase = 0;
    if (firstRound && firstRound.pricePerShare) {
      const currentTimestamp = Number(currentRound.createdTimestamp);
      const firstTimestamp = Number(firstRound.createdTimestamp);
      const daysSinceInception =
        (currentTimestamp - firstTimestamp) / (24 * 60 * 60);

      if (daysSinceInception > 0) {
        apyBase = calculateAPY(
          pricePerShare,
          Number(firstRound.pricePerShare),
          daysSinceInception
        );
      }
    }

    pools.push({
      pool: `${pool.id}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'hypersurface',
      symbol: pool.collateralAsset.symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: [pool.collateralAsset.id],
      poolMeta: 'Options Vault',
      url: `https://app.hypersurface.io/pools/${pool.id}`,
    });
  }

  return pools;
};

const apy = async () => {
  const [hyperliquidPools, basePools] = await Promise.all([
    fetchChainPools('hyperliquid', SUBGRAPH_URLS.hyperliquid),
    fetchChainPools('base', SUBGRAPH_URLS.base),
  ]);

  return [...hyperliquidPools, ...basePools];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.hypersurface.io/pools',
};
