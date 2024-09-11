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
  'fraxtal',
  // 'celo',
];
// https://github.com/curvefi/curve-api/blob/main/endpoints.md#getpools
REGISTRY_TYPES = [
  'main',
  'crypto',
  'factory',
  'factory-crypto',
  'optimism',
  'factory-crvusd',
  'factory-twocrypto',
  'factory-tricrypto',
  'factory-stable-ng',
];
exports.BLOCKCHAINID_TO_REGISTRIES = {};
exports.BLOCKCHAINIDS.forEach((blockchainId) => {
  switch (blockchainId) {
    case 'ethereum':
    case 'arbitrum':
    case 'fraxtal':
    case 'fantom':
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
exports.OVERRIDE_DATA = {
  fantom: {
    '0x3f833Ed02629545DD78AFc3D585f7F3918a3De62': {
      symbol: 'xSTABLE',
      url: 'https://curve.fi/#/fantom/pools/factory-stable-ng-24/deposit',
    },
  },
};

