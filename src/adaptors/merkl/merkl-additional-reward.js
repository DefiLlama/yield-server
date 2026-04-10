const { networks } = require('./config');
const { getData } = require('../utils');

// Adapter chain names (after formatChain + toLowerCase) that differ from merkl config
const CHAIN_ALIASES = {
  'hyperliquid l1': 'hyperevm',
  'hyperliquid': 'hyperevm',
  'binance': 'bsc',
  'polygon zkevm': 'polygon_zkevm',
};

exports.addMerklRewardApy = async (pools, protocolId, poolAddressGetter) => {
  try {
    let merklPools = [];
    let pageI = 0;

    while (true) {
      let data;
      try {
        data = await getData(
          `https://api.merkl.xyz/v4/opportunities?mainProtocolId=${protocolId}&status=LIVE&items=100&page=${pageI}`
        );
      } catch (err) {
        console.log(`failed to fetch Merkl data for ${protocolId}: ${err}`);
        break;
      }

      if (data.length === 0) break;
      merklPools.push(...data);
      pageI++;
    }

    // Build reward map keyed by chain -> address
    // Index by BOTH the merkl identifier AND all token addresses in the response
    // This handles cases where the adapter uses a different address than merkl's identifier
    // (e.g. aave uses aToken addresses, but merkl identifier is the market address)
    const merklPoolsMap = Object.fromEntries(
      Object.keys(networks).map((id) => [networks[id], {}])
    );

    merklPools.forEach((pool) => {
      if (!networks[pool.chainId]) return;

      const chain = networks[pool.chainId];
      const reward = {
        apyReward: pool.apr,
        rewardTokens: [
          ...new Set(
            pool.rewardsRecord?.breakdowns.map((x) => x.token.address) || []
          ),
        ],
      };

      // Index by identifier (primary match)
      merklPoolsMap[chain][pool.identifier.toLowerCase()] = reward;

      // Also index by each token address (fallback match)
      // Catches pools where adapter uses a receipt/wrapper token address
      // that appears in merkl's token list (e.g. aTokens, vault shares)
      if (pool.tokens) {
        for (const token of pool.tokens) {
          if (token.address) {
            const addr = token.address.toLowerCase();
            if (!merklPoolsMap[chain][addr]) {
              merklPoolsMap[chain][addr] = reward;
            }
          }
        }
      }
    });

    return pools.map((pool) => {
      // Skip if already has rewards
      if (
        pool.apyReward ||
        (pool.rewardTokens && pool.rewardTokens.length !== 0)
      ) {
        return pool;
      }

      const poolAddress = poolAddressGetter
        ? poolAddressGetter(pool)
        : pool.pool;
      const chainKey =
        CHAIN_ALIASES[pool.chain.toLowerCase()] || pool.chain.toLowerCase();
      const merklRewards =
        merklPoolsMap[chainKey]?.[poolAddress.toLowerCase()];

      if (!merklRewards) return pool;

      return {
        ...pool,
        ...merklRewards,
      };
    });
  } catch (err) {
    console.log(`Failed to add Merkl reward apy to ${protocolId}: ${err}`);
    return pools;
  }
};
