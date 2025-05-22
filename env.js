try {
  require('dotenv').config({ path: './config.env' });
} catch (e) {
  console.log('No config.env file found');
}

module.exports = {
  // API keys
  ALCHEMY_CONNECTION_ARBITRUM: process.env.ALCHEMY_CONNECTION_ARBITRUM,
  ALCHEMY_CONNECTION_ETHEREUM: process.env.ALCHEMY_CONNECTION_ETHEREUM,
  ALCHEMY_CONNECTION_POLYGON: process.env.ALCHEMY_CONNECTION_POLYGON,
  ETHEREUM_RPC: process.env.ETHEREUM_RPC,
  XDAI_RPC: process.env.XDAI_RPC,
  CRONOS_RPC: process.env.CRONOS_RPC,
  FANTOM_RPC: process.env.FANTOM_RPC,
  OPTIMISM_RPC: process.env.OPTIMISM_RPC,
  AVAX_RPC: process.env.AVAX_RPC,
  ARBITRUM_RPC: process.env.ARBITRUM_RPC,
  BASE_RPC: process.env.BASE_RPC,
  TRON_RPC: process.env.TRON_RPC,
  ZEROX_API: process.env.ZEROX_API,
  TRADERJOE: process.env.TRADERJOE,
  DISCORD_WEBHOOK: process.env.DISCORD_WEBHOOK,
  SMARDEX_SUBGRAPH_API_KEY: process.env.SMARDEX_SUBGRAPH_API_KEY,
  VENDOR_FINANCE: process.env.VENDOR_FINANCE,
  GRAPH_API_KEY: process.env.GRAPH_API_KEY,
  // DB
  REDIS_URL: process.env.REDIS_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
  OSMOSIS_API_KEY: process.env.OSMOSIS_API_KEY,
};
