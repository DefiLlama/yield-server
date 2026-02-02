const utils = require('../utils');
const sdk = require('@defillama/sdk');

const VAULTS_API = 'https://api.maxshot.ai/vaults';

// Chain ID to chain name mapping
const CHAIN_ID_TO_NAME = {
  1: 'ethereum',
  10: 'optimism',
  8453: 'base',
  9745: 'plasma',
  42161: 'arbitrum',
};

// Multi-chain vault addresses (when chainIds length > 1)
const MULTI_CHAIN_VAULT_ADDRESSES = {
  oUSDT0: '0xd507d9D4F356B84e3EEEc33eeDef85BB57f59CfB',
  oUSDC: '0xCe0F05f19845CdE36058CcFb53C755Ab8739b880',
};

const apy = async () => {
  const response = await utils.getData(VAULTS_API);
  const vaults = response.data;

  const pools = [];

  for (const vault of vaults) {
    // Convert netApy24h from 1e18 to percentage (e.g., 30480776637436565 -> 3.0480776637436565%)
    const apyValue = (Number(vault.netApy24h) / 1e18) * 100;

    // Convert totalValue from 1e18 to USD (e.g., 1860856671194000000000000 -> 1860856.671194)
    const tvlUsd = Number(vault.totalValue) / 1e18;

    // Get all chain IDs from chainIds string (e.g., "1,10,8453,42161")
    const chainIds = vault.chainIds.split(',').map(Number);
    const isMultiChain = chainIds.length > 1;

    // Create a pool for each chain
    for (const chainId of chainIds) {
      const chainName = CHAIN_ID_TO_NAME[chainId];
      if (!chainName) continue; // Skip unknown chain IDs

      // Determine pool address: use multi-chain address if chainIds > 1
      let poolAddress = vault.address;
      if (isMultiChain && MULTI_CHAIN_VAULT_ADDRESSES[vault.symbol]) {
        poolAddress = MULTI_CHAIN_VAULT_ADDRESSES[vault.symbol];
      }

      // Get underlying asset address by calling asset() function
      const assetResult = await sdk.api.abi.call({
        target: poolAddress,
        abi: "function asset() public view returns (address)",
        chain: chainName,
      });
      let underlyingToken = assetResult.output;

      pools.push({
        pool: `${poolAddress.toLowerCase()}-${chainName}`,
        chain: utils.formatChain(chainName),
        project: 'maxshot',
        symbol: utils.formatSymbol(vault.symbol),
        tvlUsd,
        apy: apyValue,
        underlyingTokens: [underlyingToken],
        url: `https://app.maxshot.ai/#/earn/${vault.address}`,
      });
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.maxshot.ai',
};
