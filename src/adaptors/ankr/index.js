const utils = require('../utils');

const buildObject = (entry, tokenString, chainString) => {
  const payload = {
    pool: `ankr-${tokenString}`,
    chain: utils.formatChain(chainString),
    project: 'ankr',
    symbol: utils.formatSymbol(tokenString),
    tvlUsd: Number(entry.totalStakedUsd),
    apy: Number(entry.apy),
  };

  return payload;
};

const fetch = async (serviceName, tokenString, chainString) => {
  data = await utils.getData('https://api.stkr.io/v1alpha/metrics');

  const idx = data.services.findIndex(
    (service) => service.serviceName === serviceName
  );

  if (idx > -1) {
    data = buildObject(data.services[idx], tokenString, chainString);
  } else {
    data = {};
  }

  return data;
};

const main = async () => {
  const data = await Promise.all([
    fetch('eth', 'aETHc', 'ethereum'),
    fetch('bnb', 'aBNBc', 'binance'),
    fetch('ftm', 'aFTMc', 'fantom'),
    fetch('polygon', 'aMATICc', 'polygon'),
    fetch('avax', 'aAVAXc', 'avalanche'),
  ]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
