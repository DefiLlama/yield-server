const NETWORKS = {
  arbitrum: 'arbitrum',
  ethereum: 'ethereum',
  optimism: 'optimism',
  polygon: 'polygon',
};

const SUBGRAPHS = {
  ethereum:
    'https://api.thegraph.com/subgraphs/name/xtokenmarket/terminal-mainnet',
  arbitrum:
    'https://api.thegraph.com/subgraphs/name/xtokenmarket/terminal-arbitrum',
  optimism:
    'https://api.thegraph.com/subgraphs/name/xtokenmarket/terminal-optimism',
  polygon:
    'https://api.thegraph.com/subgraphs/name/xtokenmarket/terminal-polygon',
};

const USDC_ADDRESSES = {
  arbitrum: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  optimism: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
  polygon: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
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
};
