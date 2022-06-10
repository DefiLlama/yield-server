const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const baseUrl = 'https://size-api.integral.link/api/v5/pools?apiKey=00Gfs4iNa/XJDBkF+/X83SRqx3MXXAngJMkpx3lM/TU=';
const mainnetUrl = `${baseUrl}&network=Mainnet`

const chains = {
  "eth": "ethereum",
}

const buildPool = (entry, chainString) => {
  const newObj = {
    pool: entry.address,
    chain: utils.formatChain(chainString),
    project: 'integral',
    symbol: entry.name.toUpperCase(),
    tvlUsd: parseFloat(BigNumber(entry.totalTokenValue).div(10 ** 18)),
    apy: parseFloat(BigNumber(entry.apr).div(10 ** 18).times(100))
  };

  return newObj;
};

const topLvl = async (chainString, url) => {
  // pull data
  let data = await utils.getData(url)
  // build pool objects
  data = data.data.map((element) => buildPool(element, chainString));

  return data;
};

const main = async () => {
  const data = await Promise.all([
    topLvl(chains.eth, mainnetUrl)
  ]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
