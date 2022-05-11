try {
  require('dotenv').config({ path: './config.env' });
} catch (e) {}

const fs = require('fs');
module.exports = {
  // API keys
  ETHERSCAN: process.env.ETHERSCAN,
  FANTOMSCAN: process.env.FANTOMSCAN,
  POLYGONSCAN: process.env.POLYGONSCAN,
  SNOWTRACE: process.env.SNOWTRACE,
  ARBISCAN: process.env.ARBISCAN,
  OPTIMISM: process.env.OPTIMISM,
  INFURA_CONNECTION: process.env.INFURA_CONNECTION,
  // ADAPTOR LIST
  ADAPTORS: JSON.stringify(
    fs.readdirSync('./src/adaptors').filter((el) => !el.includes('js'))
  ),
};
