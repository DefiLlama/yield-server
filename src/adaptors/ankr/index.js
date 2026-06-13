const utils = require('../utils');

const serviceToUrl = {
  eth: 'ethereum',
  avax: 'avax',
  polygon: 'matic',
  bnb: 'bnb',
  flowevm: 'flow'
};

const underlying = {
  eth: '0x0000000000000000000000000000000000000000',       // ETH
  avax: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',       // WAVAX
  polygon: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',    // WMATIC
  bnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',        // WBNB
  flowevm: '0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e'    // WFLOW
};

const tokenAddresses = {
  eth: '0xE95A203B1a91a908F9B9CE46459d101078c2c3cb',       // ankrETH
  avax: '0xc3344870d52688874b06d844e0c36cc39fc727f6',       // ankrAVAX
  polygon: '0x0e9b89007eee9c958c0eda24ef70723c2c93dd58',    // ankrMATIC
  bnb: '0x52F24a5e03aee338Da5fd9Df68D2b6FAe1178827',        // ankrBNB
  flowevm: '0x1b97100ea1d7126c4d60027e231ea4cb25314bdb' // ankrFLOWEVM
};

const buildObject = (entry, tokenString, chainString, serviceName) => {
  const payload = {
    pool: tokenAddresses[serviceName],
    chain: utils.formatChain(chainString),
    project: 'ankr',
    symbol: tokenString,
    tvlUsd: Number(entry.totalStakedUsd),
    apyBase: Number(entry.apy),
    url: `https://www.ankr.com/staking/stake/${serviceToUrl[serviceName]}`,
    underlyingTokens: [underlying[serviceName]],
    searchTokenOverride: tokenAddresses[serviceName],
    isIntrinsicSource: true,
  };

  return payload;
};

const fetch = async (serviceName, tokenString, chainString) => {
  let data = await utils.getData('https://api.staking.ankr.com/v1alpha/metrics');

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
    fetch('polygon', 'ankrMATIC', 'polygon'),
    fetch('avax', 'ankrAVAX', 'avalanche'),
    fetch('flowevm', 'ankrFLOWEVM', 'flow')
  ]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
