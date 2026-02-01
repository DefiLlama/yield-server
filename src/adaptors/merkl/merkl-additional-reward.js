const { networks } = require('./config');
const { getData } = require('../utils');

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


    const merklPoolsMap = Object.fromEntries(Object.keys(networks).map(id => [networks[id], {}]));
    merklPools.forEach(pool => {
      if (!networks[pool.chainId]) {
        return;
      }

      merklPoolsMap[networks[pool.chainId]][pool.identifier.toLowerCase()] = {
        apyReward: pool.apr,
        rewardTokens: [...new Set(pool.rewardsRecord?.breakdowns.map(x => x.token.address) || [])]
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