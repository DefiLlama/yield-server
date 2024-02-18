const sdk = require('@defillama/sdk');
const { v2p6Pools } = require('./config');
const v2 = require('./v2');

const call = sdk.api.abi.call;

async function getUnderlyingTokens(cellarAddress, cellarChain) {
  // Find vault in v2p6Pools
  const vault = v2p6Pools.find((pool) => pool.pool.split('-')[0].toLowerCase() === cellarAddress.toLowerCase() && pool.pool.split('-')[1].toLowerCase() === cellarChain.toLowerCase());

  // Return the deduped underlying tokens
  return [...new Set(vault.underlyingTokens)];
}

module.exports = {
  calcApy: v2.calcApy,
  getApy: v2.getApy,
  getApy7d: v2.getApy7d,
  getHoldingPosition: v2.getHoldingPosition,
  getUnderlyingTokens,
};
