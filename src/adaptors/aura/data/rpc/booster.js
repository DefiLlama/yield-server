const sdk = require('@defillama/sdk');
const boosterABI = require('../../abis/booster.json');

/**
 * Get the total number of pools from booster contract
 */
async function getPoolCount(booster, chain) {
  const result = await sdk.api.abi.call({
    abi: boosterABI.find(({ name }) => name === 'poolLength'),
    target: booster,
    chain,
    permitFailure: true,
  });
  return parseInt(result.output ?? 0);
}

/**
 * Fetch pool information for multiple pools
 */
async function fetchPoolInfo(booster, poolCount, chain) {
  const result = await sdk.api.abi.multiCall({
    abi: boosterABI.find(({ name }) => name === 'poolInfo'),
    calls: Array.from({ length: poolCount }, (_, i) => i).map((index) => ({
      target: booster,
      params: [index],
    })),
    chain,
    permitFailure: true,
  });
  return result.output;
}

module.exports = {
  getPoolCount,
  fetchPoolInfo,
};
