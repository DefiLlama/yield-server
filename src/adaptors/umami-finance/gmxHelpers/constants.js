const SYNTHS_STATS_SUBGRAPH_URL = {
  arbitrum: 'https://gmx.squids.live/gmx-synthetics-arbitrum/graphql',
  avax: 'https://gmx.squids.live/gmx-synthetics-avalanche/graphql',
};

const CONTRACTS = {
  arbitrum: {
    syntheticsReader: '0x5ca84c34a381434786738735265b9f3fd814b824',
    dataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
  },
  avax: {
    syntheticsReader: '0xbad04ddcc5cc284a86493afa75d2beb970c72216',
    dataStore: '0x2f0b22339414aded7d5f06f9d604c7ff5b2fe3f6',
  },
};

const SIGNED_PRICES_API_URL = {
  arbitrum: 'https://arbitrum-api.gmxinfra.io/signed_prices/latest',
  avax: 'https://avalanche-api.gmxinfra.io/signed_prices/latest',
};

module.exports = {
  SYNTHS_STATS_SUBGRAPH_URL,
  CONTRACTS,
  SIGNED_PRICES_API_URL,
};
