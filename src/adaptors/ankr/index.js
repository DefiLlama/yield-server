const utils = require('../utils');

const serviceToUrl = {
  eth: 'ethereum',
  ftm: 'fantom',
  avax: 'avax',
  polygon: 'matic',
  bnb: 'bnb'
}

const buildObject = (entry, tokenString, chainString, serviceName) => {
  const payload = {
    pool: `ankr-${tokenString}`,
    chain: utils.formatChain(chainString),
    project: 'ankr',
    symbol: utils.formatSymbol(tokenString),
    tvlUsd: Number(entry.totalStakedUsd),
    apy: Number(entry.apy),
    url: `https://www.ankr.com/staking/stake/${serviceToUrl[serviceName]}`,
  };

  return payload;
};

const fetch = async (serviceName, tokenString, chainString) => {
  data = await utils.getData('https://api.staking.ankr.com/v1alpha/metrics');

  const idx = data.services.findIndex(
    (service) => service.serviceName === serviceName
  );

  if (idx > -1) {
    data = buildObject(data.services[idx], tokenString, chainString, serviceName);
  } else {
    data = {};
  }

  return data;
};

const main = async () => {
  const data = await Promise.all([
    fetch('eth', 'ankrETH', 'ethereum'),
    fetch('bnb', 'ankrBNB', 'binance'),
    fetch('ftm', 'ankrFTM', 'fantom'),
    fetch('polygon', 'ankrMATIC', 'polygon'),
    fetch('avax', 'ankrAVAX', 'avalanche'),
  ]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
