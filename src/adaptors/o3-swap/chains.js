const CHAINS = {
  Ethereum: 'Ethereum',
  BNBChain: 'Binance',
  Polygon: 'Polygon',
  Arbitrum: 'Arbitrum',
  Gnosis: 'xDai',
  Fantom: 'Fantom',
  Avalanche: 'Avalanche',
  Optimism: 'Optimism',
  Cube: 'Cube',
  Metis: 'Metis',
  Celo: 'Celo',
};

const CHAIN_ENUM = {
  [CHAINS.Ethereum]: 1,
  [CHAINS.BNBChain]: 56,
  [CHAINS.Polygon]: 137,
  [CHAINS.Arbitrum]: 42161,
  [CHAINS.Gnosis]: 100,
  [CHAINS.Avalanche]: 43114,
  [CHAINS.Optimism]: 10,
  [CHAINS.Fantom]: 250,
  [CHAINS.Cube]: 1818,
  [CHAINS.Metis]: 1088,
  [CHAINS.Celo]: 42220,
};

const RATES_CHAIN = {
  [CHAINS.Ethereum]: 'eth',
  [CHAINS.BNBChain]: 'bnbchain',
  [CHAINS.Polygon]: 'polygon',
  [CHAINS.Arbitrum]: 'arbitrum',
  [CHAINS.Gnosis]: 'gnosis',
  [CHAINS.Avalanche]: 'avalanche',
  [CHAINS.Optimism]: 'optimism',
  [CHAINS.Fantom]: 'fantom',
  [CHAINS.Cube]: 'cube',
  [CHAINS.Metis]: 'metis',
  [CHAINS.Celo]: 'celo',
};

const CHAIN_RPC_HOST = {
  [CHAINS.Ethereum]:
    'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
  [CHAINS.BNBChain]: 'https://bsc-dataseed1.ninicoin.io',
  [CHAINS.Polygon]: 'https://polygon-rpc.com',
  [CHAINS.Arbitrum]: 'https://arb1.arbitrum.io/rpc',
  [CHAINS.Gnosis]: 'https://rpc.gnosischain.com',
  [CHAINS.Avalanche]: 'https://api.avax.network/ext/bc/C/rpc',
  [CHAINS.Optimism]: 'https://mainnet.optimism.io',
  [CHAINS.Fantom]: 'https://rpc.ftm.tools',
  [CHAINS.Cube]: 'https://http-mainnet.cube.network',
  [CHAINS.Metis]: 'https://andromeda.metis.io',
  [CHAINS.Celo]: 'https://forno.celo.org',
};

module.exports = {
  CHAINS,
  CHAIN_ENUM,
  RATES_CHAIN,
  CHAIN_RPC_HOST,
};
