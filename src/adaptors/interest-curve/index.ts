const utils = require('../utils');

const API_URL_BASE =
  'https://api.interestlabs.io/v1/movement/mainnet/curve/metrics';

async function getPools() {
  const pageSize = 100;
  let currentPage = 1;
  const allPools = [];

  while (true) {
    const response = await utils.getData(
      `${API_URL_BASE}?page=${currentPage}&limit=${pageSize}`
    );

    if (!response || +response.total === 0) {
      break;
    }

    allPools.push(...response.data);

    // If we've fetched all pools, break
    if (allPools.length >= +response.total) {
      break;
    }

    currentPage++;
  }

  return allPools;
}

async function main() {
  // We're not using on-chain RPC requests here due to the rate limiting and instability of both official and third party RPCs and using our own load-balanced API.
  const pools = await getPools();

  const defiLlamaPools = pools
    .map((pool) => {
      const poolSymbol = pool.isStable
        ? 'stable-' + pool.symbols.join('-')
        : 'volatile-' + pool.symbols.join('-');

      return {
        pool: pool.poolId + '-move',
        chain: utils.formatChain('move'),
        project: 'interest-curve',
        symbol: poolSymbol,
        tvlUsd: parseFloat(pool.metrics.tvl),
        apyBase: +pool.metrics.apr,
        apyReward: +pool.metrics.farmApr,
        rewardTokens: Array.from(new Set(pool.rewards)),
        underlyingTokens: pool.coins,
      };
    })
    .filter(Boolean); // Remove null entries

  return defiLlamaPools;
}

module.exports = {
  timetravel: false,
  apy: main,
  url: `https://www.interest.xyz/pools`,
};
