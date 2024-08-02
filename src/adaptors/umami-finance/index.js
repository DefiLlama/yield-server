const { getUmamiGmSynthsVaultsYield } = require('./umamiGmSynthVaults.js');
const { getUmamiGmVaultsYield } = require('./umamiGmVaults.js');

const main = async () => {
  const [arbitrumSynthGmVaults, arbitrumGmVaults, avaxGmVaults] =
    await Promise.all([
      getUmamiGmSynthsVaultsYield('arbitrum'),
      getUmamiGmVaultsYield('arbitrum'),
      getUmamiGmVaultsYield('avax'),
    ]);

  const arbitrumVaults = [...arbitrumSynthGmVaults, ...arbitrumGmVaults].map(
    (strat) => ({
      ...strat,
      chain: 'Arbitrum',
      project: 'umami-finance',
    })
  );
  const avaxVaults = [...avaxGmVaults].map((strat) => ({
    ...strat,
    chain: 'Avalanche',
    project: 'umami-finance',
  }));

  return [...arbitrumVaults, ...avaxVaults];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://umami.finance/',
};
