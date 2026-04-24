const { getPoolIds } = require('./rpc/balancer-pool');
const { getBalancerPoolsData } = require('./subgraph/balancer-pools');

/**
 * Get Balancer pool data with processed APRs, staking rewards, and underlying tokens
 */
async function getBalancerData(activePools, sdkChainName, chainConfig) {
  const poolIdResults = await getPoolIds(
    activePools.map((pool) => pool.lptoken),
    sdkChainName
  );

  const balancerPoolsDataMap = await getBalancerPoolsData(
    activePools.map((pool, i) =>
      poolIdResults[i]?.success && poolIdResults[i]?.output
        ? poolIdResults[i].output
        : pool.lptoken
    ),
    chainConfig.balancerChainName
  );

  return activePools.reduce((acc, pool, i) => {
    const balancerPoolId =
      poolIdResults[i]?.success && poolIdResults[i]?.output
        ? poolIdResults[i].output
        : pool.lptoken;
    const poolData = balancerPoolsDataMap[balancerPoolId.toLowerCase()];
    if (!poolData) return acc;

    const apyBase = poolData.dynamicData?.aprItems
      ? poolData.dynamicData.aprItems.reduce((aprAcc, item) => {
          const aprValue = item.apr * 100 || 0;

          if (
            item.type === 'SWAP_FEE' ||
            item.type === 'SWAP_FEE_24H' ||
            item.type === 'IB_YIELD'
          ) {
            aprAcc += aprValue;
          }

          return aprAcc;
        }, 0)
      : 0;

    acc[pool.poolIndex] = {
      apyBase,
      underlyingTokens:
        poolData.poolTokens?.flatMap((token) =>
          token.underlyingToken && token.useUnderlyingForAddRemove
            ? [token.address, token.underlyingToken.address]
            : [token.address]
        ) || [],
    };

    return acc;
  }, {});
}

module.exports = {
  getBalancerData,
};
