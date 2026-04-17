const { networks, chainAliases } = require('./config');
const { getData } = require('../utils');

const getChainAliases = (canonical) =>
  chainAliases[canonical] || [canonical];

// Opportunity types whose `tokens[]` array lists collateral or debt assets
// rather than the rewarded supply asset. Token-address fallback must not
// index these — e.g. a "Borrow USDT using sUSDp as collateral" campaign
// lists sUSDp in tokens[] and would otherwise be miscredited to sUSDp
// suppliers as apyReward.
const BORROW_SIDE_TYPES = new Set([
  'AAVE_BORROW',
  'AAVE_BORROWING',
  'AAVE_NET_BORROWING',
  'FLUIDVAULT_BORROW',
  'FLUIDVAULT_COLLATERAL',
  'MORPHOBORROW',
  'MORPHOBORROW_SINGLETOKEN',
  'MORPHOCOLLATERAL',
  'MULTILOG_DUTCH',
  'TOWNSQUARE_COLLATERAL',
]);

exports.addMerklRewardApy = async (
  pools,
  protocolId,
  poolAddressGetter,
) => {
  try {
    let merklPools = [];
    let pageI = 0;

    while(true) {
      let data;
      try {
        data = await getData(`https://api.merkl.xyz/v4/opportunities?mainProtocolId=${protocolId}&status=LIVE&items=100&page=${pageI}`);
      } catch (err) {
        console.log(`failed to fetch Merkl data for ${protocolId}: ${err}`);
        break;
      }

      if (data.length === 0) {
        break;
      }

      merklPools.push(...data);
      pageI++;
    }

    const merklPoolsMap = {};
    for (const canonical of Object.values(networks)) {
      for (const alias of getChainAliases(canonical)) {
        merklPoolsMap[alias] = {};
      }
    }

    merklPools.forEach(pool => {
      const canonical = networks[pool.chainId];
      if (!canonical) {
        return;
      }

      const entry = {
        apyReward: pool.apr,
        rewardTokens: [...new Set(pool.rewardsRecord?.breakdowns.map(x => x.token.address) || [])]
      };
      const id = pool.identifier.toLowerCase();
      // Also index under each token address so adapters keying on a
      // receipt/wrapper token (e.g. an aToken or vault share) can match
      // an opportunity whose primary identifier is the underlying market.
      // Skipped for borrow-side types where tokens[] lists collateral.
      const tokenAddrs = BORROW_SIDE_TYPES.has(pool.type)
        ? []
        : (pool.tokens || [])
            .map(t => t?.address?.toLowerCase())
            .filter(Boolean);
      for (const alias of getChainAliases(canonical)) {
        merklPoolsMap[alias][id] = entry;
        for (const addr of tokenAddrs) {
          if (!merklPoolsMap[alias][addr]) {
            merklPoolsMap[alias][addr] = entry;
          }
        }
      }
    });

    return pools.map(pool => {
      const poolAddress = poolAddressGetter ? poolAddressGetter(pool) : pool.pool;
      const merklRewards = merklPoolsMap[pool.chain.toLowerCase()]?.[poolAddress.toLowerCase()];

      if (!merklRewards) {
        return pool;
      }

      // if the data is already present, don't overwrite it
      if (pool.apyReward || (pool.rewardTokens && pool.rewardTokens.length !== 0)) {
        console.log('pool already has apyReward or rewardTokens', pool.pool);
        return pool;
      }

      return {
        ...pool,
        ...merklRewards,
      }
    });
  } catch (err) {
    console.log(`Failed to add Merkl reward apy to ${protocolId}: ${err}`);

    // If we fail to fetch Merkl data, just return the original pools
    return pools;
  }
};
