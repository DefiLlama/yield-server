const sdk = require('@defillama/sdk');
const l2CoordinatorABI = require('../../abis/l2coordinator.json');

/**
 * Get mintRate from L2Coordinator contract
 * Returns 1e18 (100% multiplier) as fallback
 */
async function getMintRate(l2Coordinator, chain) {
  if (!l2Coordinator) return 1000000000000000000n;

  try {
    const result = await sdk.api.abi.call({
      abi: l2CoordinatorABI.find(({ name }) => name === 'mintRate'),
      target: l2Coordinator,
      chain,
      permitFailure: true,
    });
    return result.success && result.output
      ? BigInt(result.output)
      : 1000000000000000000n;
  } catch {
    return 1000000000000000000n;
  }
}

module.exports = {
  getMintRate,
};
