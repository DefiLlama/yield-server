const { getGmMarketsAprForUmami } = require('./gmxHelpers/gmMarketsApr.js');
const { getUmamiGmSynthsVaultsYield } = require('./umamiGmSynthVaults.js');
const { getUmamiGmVaultsYield } = require('./umamiGmVaults.js');

const main = async () => {
  // Fetch infos & fees from GM markets first
  const [arbitrumGmMarketsInfos, avalancheGmMarketsInfos] = await Promise.all([
    getGmMarketsAprForUmami('arbitrum'),
    getGmMarketsAprForUmami('avax'),
  ]);
  const [arbitrumSynthGmVaults, arbitrumGmVaults, avaxGmVaults] =
    await Promise.all([
      getUmamiGmSynthsVaultsYield('arbitrum', arbitrumGmMarketsInfos),
      getUmamiGmVaultsYield('arbitrum', arbitrumGmMarketsInfos),
      getUmamiGmVaultsYield('avax', avalancheGmMarketsInfos),
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
