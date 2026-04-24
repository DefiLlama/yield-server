const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');

/**
 * Configure SDK to use custom RPC provider for a chain
 */
function setupRpcProvider(chainName, chainConfig) {
  if (chainConfig.rpc && chainConfig.chainId) {
    const sdkChainName = chainConfig.sdkChainName || chainName;
    const network = {
      name: sdkChainName,
      chainId: chainConfig.chainId,
    };
    sdk.api.config.setProvider(
      sdkChainName,
      new ethers.providers.JsonRpcProvider(chainConfig.rpc, network)
    );
  }
}

module.exports = {
  setupRpcProvider,
};
