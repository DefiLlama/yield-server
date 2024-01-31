const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const mainnetUrlSize = `https://size-api.integral.link/api/v6/pools?apiKey=00Gfs4iNa%2FXJDBkF%2B%2FX83SRqx3MXXAngJMkpx3lM%2FTU=&network=Mainnet`;
const mainnetUrlFive = `https://five-api.integral.link/api/v1/pools?apiKey=00Gfs4iNa%2FXJDBkF%2B%2FX83SRqx3MXXAngJMkpx3lM%2FTU=&network=Mainnet`;
const arbitrumUrlSize = `https://arbitrum-size-api.integral.link/api/v6/pools?apiKey=00Gfs4iNa%2FXJDBkF%2B%2FX83SRqx3MXXAngJMkpx3lM%2FTU=&network=Arbitrum`;

const chains = {
  eth: 'ethereum',
  arb: 'arbitrum',
};

const buildPool = (entry, chainString, version) => {
  const newObj = {
    pool: entry.address,
    chain: utils.formatChain(chainString),
    project: 'integral',
    poolMeta: version,
    symbol: entry.name.toUpperCase(),
    tvlUsd: parseFloat(BigNumber(entry.totalTokenValue).div(10 ** 18)),
    apyBase: entry.swapApr ? parseFloat(BigNumber(entry.swapApr).div(10 ** 18).times(100)) : 0,
    apyReward: entry.lpRewardApr ? parseFloat(BigNumber(entry.lpRewardApr).div(10 ** 18).times(100)) : 0,
  };

  return newObj;
};

const topLvl = async (chainString, url, version) => {
  // pull data
  let data = await utils.getData(url);
  // build pool objects
  data = data.data.map((element) => buildPool(element, chainString, version));

  return data;
};

const main = async () => {
  const data = await Promise.all([
    topLvl(chains.eth, mainnetUrlSize, 'SIZE'),
    topLvl(chains.eth, mainnetUrlFive, 'FIVE'),
    topLvl(chains.arb, arbitrumUrlSize, 'SIZE'),
  ]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://size.integral.link/pools',
};
