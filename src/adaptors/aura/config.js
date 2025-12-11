// Chain-specific configuration
const CHAIN_CONFIG = {
  ethereum: {
    llamaChainName: 'Ethereum',
    balancerChainName: 'MAINNET',
    booster: '0xA57b8d98dAE62B26Ec3bcC4a365338157060B234',
    chainId: 1,
    tokens: {
      AURA: '0xc0c293ce456ff0ed870add98a0828dd4d2903dbf',
      BAL: '0xba100000625a3754423978a60c9317c58a424e3d',
    },
    subgraph:
      'https://api.subgraph.ormilabs.com/api/public/396b336b-4ed7-469f-a8f4-468e1e26e9a8/subgraphs/aura-finance-mainnet/v0.0.1/',
  },
  arbitrum: {
    llamaChainName: 'Arbitrum',
    balancerChainName: 'ARBITRUM',
    booster: '0x98Ef32edd24e2c92525E59afc4475C1242a30184',
    chainId: 42161,
    l2Coordinator: '0xeC1c780A275438916E7CEb174D80878f29580606',
    tokens: {
      AURA: '0x1509706a6c66ca549ff0cb464de88231ddbe213b',
      BAL: '0x040d1edc9569d4bab2d15287dc5a4f10f56a56b8',
    },
    subgraph:
      'https://api.subgraph.ormilabs.com/api/public/396b336b-4ed7-469f-a8f4-468e1e26e9a8/subgraphs/aura-finance-arbitrum/v0.0.1/',
  },
  base: {
    llamaChainName: 'Base',
    balancerChainName: 'BASE',
    booster: '0x98Ef32edd24e2c92525E59afc4475C1242a30184',
    chainId: 8453,
    l2Coordinator: '0x8b2970c237656d3895588B99a8bFe977D5618201',
    tokens: {
      AURA: '0x1509706a6c66ca549ff0cb464de88231ddbe213b',
      BAL: '0x4158734d47fc9692176b5085e0f52ee0da5d47f1',
    },
    subgraph:
      'https://api.subgraph.ormilabs.com/api/public/396b336b-4ed7-469f-a8f4-468e1e26e9a8/subgraphs/aura-finance-base/v0.0.1/',
  },
  avalanche: {
    llamaChainName: 'Avalanche',
    balancerChainName: 'AVALANCHE',
    sdkChainName: 'avax',
    booster: '0x98Ef32edd24e2c92525E59afc4475C1242a30184',
    chainId: 43114,
    l2Coordinator: '0x8b2970c237656d3895588B99a8bFe977D5618201',
    tokens: {
      AURA: '0x1509706a6c66ca549ff0cb464de88231ddbe213b',
      BAL: '0xe15bcb9e0ea69e6ab9fa080c4c4a5632896298c3',
    },
    subgraph:
      'https://api.subgraph.ormilabs.com/api/public/396b336b-4ed7-469f-a8f4-468e1e26e9a8/subgraphs/aura-finance-avalanche/v0.0.1/',
  },
  gnosis: {
    llamaChainName: 'xDai',
    balancerChainName: 'GNOSIS',
    sdkChainName: 'xdai',
    booster: '0x98Ef32edd24e2c92525E59afc4475C1242a30184',
    chainId: 100,
    l2Coordinator: '0x8b2970c237656d3895588B99a8bFe977D5618201',
    tokens: {
      AURA: '0x1509706a6c66ca549ff0cb464de88231ddbe213b',
      BAL: '0x7ef541e2a22058048904fe5744f9c7e4c57af717',
    },
    subgraph:
      'https://subgraph.satsuma-prod.com/cae76ab408ca/1xhub-ltd/aura-finance-gnosis/api',
  },
  optimism: {
    llamaChainName: 'Optimism',
    balancerChainName: 'OPTIMISM',
    booster: '0x98Ef32edd24e2c92525E59afc4475C1242a30184',
    chainId: 10,
    l2Coordinator: '0xeC1c780A275438916E7CEb174D80878f29580606',
    tokens: {
      AURA: '0x1509706a6c66ca549ff0cb464de88231ddbe213b',
      BAL: '0xfe8b128ba8c78aabc59d4c64cee7ff28e9379921',
    },
    subgraph:
      'https://api.subgraph.ormilabs.com/api/public/396b336b-4ed7-469f-a8f4-468e1e26e9a8/subgraphs/aura-finance-optimism/v0.0.1/',
  },
  polygon: {
    llamaChainName: 'Polygon',
    balancerChainName: 'POLYGON',
    booster: '0x98Ef32edd24e2c92525E59afc4475C1242a30184',
    chainId: 137,
    l2Coordinator: '0x8b2970c237656d3895588B99a8bFe977D5618201',
    tokens: {
      AURA: '0x1509706a6c66ca549ff0cb464de88231ddbe213b',
      BAL: '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3',
    },
    subgraph:
      'https://api.subgraph.ormilabs.com/api/public/396b336b-4ed7-469f-a8f4-468e1e26e9a8/subgraphs/aura-finance-polygon/v0.0.1/',
  },
};

module.exports = {
  CHAIN_CONFIG,
};
