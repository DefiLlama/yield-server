const { getUmamiGmSynthsVaultsYield } = require('./umamiGmSynthVaults.js');
const { getUmamiGmVaultsYield } = require('./umamiGmVaults.js');

const main = async () => {
  const [synthGmVaults, gmVaults] = await Promise.all([
    getUmamiGmSynthsVaultsYield(),
    getUmamiGmVaultsYield(),
  ]);

  return [...synthGmVaults, ...gmVaults].map((strat) => ({
    ...strat,
    chain: 'Arbitrum',
    project: 'umami-finance',
  }));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://umami.finance/',
};
