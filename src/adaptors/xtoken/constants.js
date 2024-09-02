const sdk = require('@defillama/sdk');
const NETWORKS = {
  arbitrum: 'arbitrum',
  ethereum: 'ethereum',
  optimism: 'optimism',
  polygon: 'polygon',
};

const SUBGRAPHS = {
  ethereum: sdk.graph.modifyEndpoint('AhQcCNvtM3YEoCBPQFYfPzxwY6Rk2nFqydr4276zki2c'),
  arbitrum: sdk.graph.modifyEndpoint('HQFMggtEW3AfDLp8GCPYaaZi91K1SgH9BjnGDxUDptt5'),
  optimism: sdk.graph.modifyEndpoint('DxV73USPBdBXunZFi1UEkBqL6pNA33rt7JYs5hgGbyEc'),
  polygon: sdk.graph.modifyEndpoint('9ckmB5VjYouBNxWFWrDsXpNqsNF9jdDewnba8Yx5a9e2'),
};

const USDC_ADDRESSES = {
  arbitrum: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  optimism: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
  polygon: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
};

const DELISTED_POOLS = {
  arbitrum: [],
  ethereum: [
    '0x6148a1bd2be586e981115f9c0b16a09bbc271e2c',
    '0xc5f0237a2a2bb9dc60da73491ad39a1afc4c8b63',
    '0x7fc70abe76605d1ef1f7a5ddc5e2ad35a43a6949',
  ],
  optimism: ['0x6148a1bd2be586e981115f9c0b16a09bbc271e2c'],
  polygon: [],
};

const NETWORK_IDS = {
  arbitrum: 42161,
  ethereum: 1,
  optimism: 10,
  optimism: 137,
};

const BASE_APP_URL = 'https://app.xtokenterminal.io/mining';

const COINS_PRICES_URL = 'https://coins.llama.fi/prices/current';

module.exports = {
  NETWORKS,
  SUBGRAPHS,
  USDC_ADDRESSES,
  NETWORK_IDS,
  BASE_APP_URL,
  COINS_PRICES_URL,
  DELISTED_POOLS,
};
