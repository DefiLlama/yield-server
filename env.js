try {
  require('dotenv').config({ path: './config.env' });
} catch (e) {}

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
  TVL_SPIKE_WEBHOOK: process.env.TVL_SPIKE_WEBHOOK,
  NEW_YIELDS_WEBHOOK: process.env.NEW_YIELDS_WEBHOOK,
  STALE_PROJECTS_WEBHOOK: process.env.STALE_PROJECTS_WEBHOOK,
  // DB
  DATABASE_URL: process.env.DATABASE_URL,
};
