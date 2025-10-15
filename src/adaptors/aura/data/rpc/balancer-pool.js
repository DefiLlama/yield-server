const sdk = require('@defillama/sdk');
const balancerPoolABI = require('../../abis/balancerPool.json');

/**
 * Get pool IDs for multiple Balancer pools
 */
async function getPoolIds(lpTokens, chain) {
  const result = await sdk.api.abi.multiCall({
    abi: balancerPoolABI.find(({ name }) => name === 'getPoolId'),
    calls: lpTokens.map((token) => ({ target: token })),
    chain,
    permitFailure: true,
  });
  return result.output;
}

module.exports = {
  getPoolIds,
};
