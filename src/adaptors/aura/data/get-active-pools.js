const { getPoolCount, fetchPoolInfo } = require('./rpc/booster');

/**
 * Get all active (non-shutdown) pools from the booster contract
 */
async function getActivePools(chainName, chainConfig) {
  if (!chainConfig?.booster) return [];

  const poolLength = await getPoolCount(chainConfig.booster, chainName);
  const allPoolsRaw = await fetchPoolInfo(
    chainConfig.booster,
    poolLength,
    chainName
  );

  return allPoolsRaw.flatMap(({ output }, index) =>
    output && !output.shutdown ? [{ ...output, poolIndex: index }] : []
  );
}

module.exports = {
  getActivePools,
};
