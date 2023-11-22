exports.CRV_API_BASE_URL = 'https://api.curve.fi/api';
exports.BLOCKCHAINIDS = [
  'ethereum',
  'polygon',
  'fantom',
  'arbitrum',
  'avalanche',
  'optimism',
  'xdai',
  'moonbeam',
  'kava',
  'base',
  // 'celo',
];
// https://github.com/curvefi/curve-api/blob/main/endpoints.md#getpools
REGISTRY_TYPES = ['main', 'crypto', 'factory', 'factory-crypto', 'optimism', 'factory-crvusd', 'factory-tricrypto'];
exports.BLOCKCHAINID_TO_REGISTRIES = {};
exports.BLOCKCHAINIDS.forEach((blockchainId) => {
  switch (blockchainId) {
    case 'ethereum':
      blockchainRegistries = REGISTRY_TYPES;
      break;
    case 'xdai':
      blockchainRegistries = REGISTRY_TYPES.slice(0, 3);
      break;
    default:
      blockchainRegistries = REGISTRY_TYPES.slice(0, -1);
      break;
  }
  exports.BLOCKCHAINID_TO_REGISTRIES[blockchainId] = blockchainRegistries;
});
