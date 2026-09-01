const sdk = require('@defillama/sdk');

/**
 * Get symbols for multiple ERC20 tokens
 */
async function getSymbols(tokenAddresses, chain) {
  const result = await sdk.api.abi.multiCall({
    abi: 'erc20:symbol',
    calls: tokenAddresses.map((address) => ({ target: address })),
    chain,
    permitFailure: true,
  });
  return result.output.reduce((acc, { output }, idx) => {
    acc[idx] = output?.replace(/-BPT$/, '') || null;
    return acc;
  }, {});
}

/**
 * Get total supplies for multiple ERC20 tokens
 */
async function getTotalSupplies(tokenAddresses, chain) {
  const result = await sdk.api.abi.multiCall({
    abi: 'erc20:totalSupply',
    calls: tokenAddresses.map((address) => ({ target: address })),
    chain,
    permitFailure: true,
  });
  return result.output;
}

module.exports = {
  getSymbols,
  getTotalSupplies,
};
