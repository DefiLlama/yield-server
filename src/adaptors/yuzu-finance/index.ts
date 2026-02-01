const utils = require('../utils');

const YUZU_API_URL_BASE = 'https://mainnet-api.yuzu.finance/v1';

async function getPools() {
  const pageSize = 100;
  let currentPage = 1;
  let allPools = [];

  while (true) {
    const response = await utils.getData(
      `${YUZU_API_URL_BASE}/pools?page=${currentPage}&pageSize=${pageSize}`
    );

    if (!response?.data || response.data.length === 0) {
      break;
    }

    allPools = allPools.concat(response.data);

    // If we've fetched all pools, break
    if (allPools.length >= response.total) {
      break;
    }

    currentPage++;
  }

  return allPools;
}

async function getTokens() {
  const response = await utils.getData(
    `${YUZU_API_URL_BASE}/tokens?pageSize=100`
  );

  if (!response?.data) {
    return [];
  }

  return response.data;
}

async function main() {
  // We're not using on-chain RPC requests here due to the rate limiting and instability of both official and third party RPCs and using our own load-balanced API.
  const pools = await getPools();
  const tokens = await getTokens();

  const defiLlamaPools = pools
    .map((pool) => {
      const token0 = tokens.find((token) => token.metadata === pool.token0);
      const token1 = tokens.find((token) => token.metadata === pool.token1);
      const symbol =
        token0 && token1 ? `${token0.symbol}-${token1.symbol}` : 'unknown';

      return {
        pool: pool.poolAddr + '-move',
        chain: utils.formatChain('move'),
        project: 'yuzu-finance',
        symbol,
        tvlUsd: parseFloat(pool.tvl),
        apyBase: pool.feeApr * 100,
        apyReward: pool.rewardApr * 100,
        // Ensure unique reward tokens since the frontend allows adding the same token multiple times
        // This prevents duplicate rewards from appearing in the DefiLlama dashboard
        rewardTokens: Array.from(
          new Set(pool.rewardInfos?.map((reward) => reward.tokenMetadata) || [])
        ),
        underlyingTokens: [pool.token0, pool.token1],
        volumeUsd1d: +pool.volume24h,
        volumeUsd7d: +pool.volume7d,
      };
    })
    .filter(Boolean); // Remove null entries

  return defiLlamaPools;
}

module.exports = {
  timetravel: false,
  apy: main,
  url: `${YUZU_API_URL_BASE}/pools`,
};
