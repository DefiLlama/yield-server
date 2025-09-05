const axios = require('axios');
const utils = require('../utils');

const MOSAIC_AMM_LIQUIDITY_POOL_URL = 'https://app.mosaic.ag/liquidity';
const MOSAIC_AMM_POOL_STATS_URL = 'https://stats.mosaic.ag/v1/public/pools';

async function apy() {
  const pools = (await utils.getData(MOSAIC_AMM_POOL_STATS_URL))?.data?.pools;
  const tokens = pools.flatMap((pool) => [
    pool.metadata.token_x,
    pool.metadata.token_y,
  ]);
  const uniqueTokens = [...new Set(tokens)];
  const tokensInfo = await getTokensInfo(uniqueTokens);

  return pools
    .map((pool) => {
      const tokenXInfo = tokensInfo[pool.metadata.token_x];
      const tokenYInfo = tokensInfo[pool.metadata.token_y];

      const symbol =
        tokenXInfo && tokenYInfo
          ? `${tokenXInfo?.symbol}-${tokenYInfo?.symbol}`
          : 'UNKNOWN';

      const rewardTokens = pool.active_farms.map(
        (farm) => farm.metadata.reward_token
      );

      return {
        pool: pool.pool_address + '-move',
        chain: utils.formatChain('move'),
        project: 'mosaic-amm',
        symbol: symbol,
        tvlUsd: pool.stats.tvl_usd,
        apyBase: pool.stats.apr_fees,
        apyReward: pool.stats.apr_farming_rewards,
        volumeUsd1d: +pool.stats.volume_24h_usd,
        rewardTokens: rewardTokens,
        underlyingTokens: [pool.metadata.token_x, pool.metadata.token_y],
        url: `${MOSAIC_AMM_LIQUIDITY_POOL_URL}/add?pool=${pool.pool_address}`,
      };
    })
    .filter((item) => !!item);
}

// Return a mapping of token addresses to their info
async function getTokensInfo(tokenAddresses) {
  const normalizedAddressToAddress = {};
  for (const address of tokenAddresses) {
    const normalizedAddress = normalizeTokenAddress(address);
    normalizedAddressToAddress[normalizedAddress] = address;
  }
  const normalizedAddresses = Object.keys(normalizedAddressToAddress);

  const response = await axios.post(
    `https://indexer.mainnet.movementnetwork.xyz/v1/graphql`,
    {
      query: `
        query GetTokensInfo($addresses: [String!]) {
          fungible_asset_metadata(
            where: {asset_type: {_in: $addresses}}
          ) {
            asset_type
            symbol
          }
        }
      `,
      variables: {
        addresses: normalizedAddresses,
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  const tokensInfo = {};
  for (const tokenInfo of response.data.data.fungible_asset_metadata) {
    const normalizedAddress = normalizeTokenAddress(tokenInfo.asset_type);
    const tokenAddress = normalizedAddressToAddress[normalizedAddress];
    if (!tokenAddress) {
      continue;
    }

    tokensInfo[tokenAddress] = tokenInfo;
  }

  return tokensInfo;
}

// Format of normalized address is `0xadc..def` with 66 characters in total (2 for 0x + 64 for address)
function normalizeTokenAddress(address) {
  let addressWithoutPrefix = address;
  if (address.startsWith('0x')) {
    addressWithoutPrefix = address.slice(2);
  }

  if (addressWithoutPrefix.length < 64) {
    // Add leading zeros to make it 64 characters long
    addressWithoutPrefix = addressWithoutPrefix.padStart(64, '0');
  }

  return `0x${addressWithoutPrefix}`;
}

module.exports = {
  timetravel: false,
  apy: apy,
  url: `${MOSAIC_AMM_LIQUIDITY_POOL_URL}/explore`,
};
