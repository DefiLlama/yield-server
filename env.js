try {
  require('dotenv').config({ path: './config.env' });
} catch (e) {}

const fs = require('fs');
module.exports = {
  // API keys
  INFURA_CONNECTION: process.env.INFURA_CONNECTION,
  ALCHEMY_CONNECTION_POLYGON: process.env.ALCHEMY_CONNECTION_POLYGON,
  ALCHEMY_CONNECTION_ARBITRUM: process.env.ALCHEMY_CONNECTION_ARBITRUM,
  XDAI_RPC: process.env.XDAI_RPC,
  CRONOS_RPC: process.env.CRONOS_RPC,
  FANTOM_RPC: process.env.FANTOM_RPC,
  TVL_SPIKE_WEBHOOK: process.env.TVL_SPIKE_WEBHOOK,
  NEW_YIELDS_WEBHOOK: process.env.NEW_YIELDS_WEBHOOK,
  // ADAPTOR LIST
  ADAPTORS: JSON.stringify(
    fs
      .readdirSync('./src/adaptors')
      .filter((el) => !el.includes('js') && el !== '.DS_Store')
  ),
  // DB
  DB_USER: process.env.DB_USER,
  DB_NAME: process.env.DB_NAME,
  DB_PW: process.env.DB_PW,
  DB_PORT: process.env.DB_PORT,
  DB_HOST: process.env.DB_HOST,
};
