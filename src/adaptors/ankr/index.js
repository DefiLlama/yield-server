const utils = require('../utils');

const serviceToUrl = {
  eth: 'ethereum',
  ftm: 'fantom',
  avax: 'avax',
  polygon: 'matic',
  bnb: 'bnb',
};

const underlying = {
  eth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  ftm: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
  avax: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
  polygon: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  bnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
};

const buildObject = (entry, tokenString, chainString, serviceName) => {
  const payload = {
    pool: `ankr-${tokenString}`,
    chain: utils.formatChain(chainString),
    project: 'ankr',
    symbol: utils.formatSymbol(tokenString),
    tvlUsd: Number(entry.totalStakedUsd),
    apy: Number(entry.apy),
    url: `https://www.ankr.com/staking/stake/${serviceToUrl[serviceName]}`,
    underlyingTokens: [underlying[serviceName]],
  };

  return payload;
};

const fetch = async (serviceName, tokenString, chainString) => {
  data = await utils.getData('https://api.staking.ankr.com/v1alpha/metrics');

  const idx = data.services.findIndex(
    (service) => service.serviceName === serviceName
  );

  if (idx > -1) {
    data = buildObject(
      data.services[idx],
      tokenString,
      chainString,
      serviceName
    );
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
