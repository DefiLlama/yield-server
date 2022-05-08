// const axios = require('axios');
const utils = require('../utils');

const pfcore = 'https://api.pickle.finance/prod/protocol/pfcore/';

const filterActiveJars = (pfcore) => {
  const jars = Object.values(pfcore.assets).flat(1);
  const filtered = jars.filter(
    (jar) =>
      jar.enablement === 'enabled' &&
      jar.details.harvestStats &&
      (jar.aprStats ||
        jar.farm?.details.farmApyComponents ||
        jar.details.farmApyComponents)
  );
  return filtered;
};

const getApy = (jar) => {
  let apy = 0;
  if (jar.aprStats?.apy) apy += jar.aprStats.apy;
  if (jar.farm?.details.farmApyComponents)
    apy += jar.farm.details.farmApyComponents.reduce((a, b) => a + b.apr, 0);
  if (jar.details.farmApyComponents)
    apy += jar.details.farmApyComponents.reduce((a, b) => a + b.apr, 0);
  return apy;
};

const main = async () => {
  const jars = filterActiveJars(await utils.getData(pfcore));

  const poolsObjects = jars.map((jar) => {
    const pool = jar.details.apiKey;

    const chain = utils.formatChain(
      jar.chain === 'eth'
        ? 'ethereum'
        : jar.chain === 'okex'
        ? 'okexchain'
        : jar.chain
    );
    const tokens = jar.depositToken.components;
    const symbol = utils.formatSymbol(
      tokens ? tokens.join('-') : jar.depositToken.name.toLowerCase()
    );

    const tvlUsd = jar.details.harvestStats.balanceUSD;
    const apy = getApy(jar);
    return {
      pool,
      chain,
      project: 'pickle',
      symbol,
      tvlUsd,
      apy,
    };
  });

  return poolsObjects;
};

module.exports = {
  timetravel: false,
  apy: main,
};
