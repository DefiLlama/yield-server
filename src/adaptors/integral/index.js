const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const baseUrlSize =
  'https://size-api.integral.link/api/v5/pools?apiKey=00Gfs4iNa%2FXJDBkF%2B%2FX83SRqx3MXXAngJMkpx3lM%2FTU=';
const baseUrlFive =
  'https://five-api.integral.link/api/v1/pools?apiKey=00Gfs4iNa%2FXJDBkF%2B%2FX83SRqx3MXXAngJMkpx3lM%2FTU=';
const mainnetUrlSize = `${baseUrlSize}&network=Mainnet`;
const mainnetUrlFive = `${baseUrlFive}&network=Mainnet`;

const chains = {
  eth: 'ethereum',
};

const buildPool = (entry, chainString, version) => {
  const newObj = {
    pool: entry.address,
    chain: utils.formatChain(chainString),
    project: 'integral',
    poolMeta: version,
    symbol: entry.name.toUpperCase(),
    tvlUsd: parseFloat(BigNumber(entry.totalTokenValue).div(10 ** 18)),
    apy: entry.apy
      ? parseFloat(
          BigNumber(entry.apy)
            .div(10 ** 18)
            .times(100)
        )
      : parseFloat(
          BigNumber(entry.apr)
            .div(10 ** 18)
            .times(100)
        ),
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
  ]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://size.integral.link/pools',
};
