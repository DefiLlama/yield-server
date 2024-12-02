const sdk = require('@defillama/sdk');
exports.constants = {
  PROJECT_NAME: 'swapr-v2',
  XDAI_CHAIN: 'xdai',
  ARBITRUM_CHAIN: 'arbitrum',
  KPI_ENDPOINT: 'https://api.thegraph.com/subgraphs/name/luzzif/carrot-xdai',
  XDAI_ENDPOINT:
    'https://api.thegraph.com/subgraphs/name/dxgraphs/swapr-xdai-v2',
  ARBITRUM_ENDPOINT: sdk.graph.modifyEndpoint(
    '8CtcD8EzHq6YyQrnb4XFz2pnwXVx3nHruj4pcDjHRKpt'
  ),
};
