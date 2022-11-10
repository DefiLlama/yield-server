try {
  require('dotenv').config({ path: './config.env' });
} catch (e) {}

module.exports = {
  // API keys
  ALCHEMY_CONNECTION_POLYGON: process.env.ALCHEMY_CONNECTION_POLYGON,
  ALCHEMY_CONNECTION_ARBITRUM: process.env.ALCHEMY_CONNECTION_ARBITRUM,
  XDAI_RPC: process.env.XDAI_RPC,
  CRONOS_RPC: process.env.CRONOS_RPC,
  FANTOM_RPC: process.env.FANTOM_RPC,
  OPTIMISM_RPC: process.env.OPTIMISM_RPC,
  TVL_SPIKE_WEBHOOK: process.env.TVL_SPIKE_WEBHOOK,
  NEW_YIELDS_WEBHOOK: process.env.NEW_YIELDS_WEBHOOK,
  STALE_PROJECTS_WEBHOOK: process.env.STALE_PROJECTS_WEBHOOK,
  // DB
  DATABASE_URL: process.env.DATABASE_URL,
};
