const utils = require('../utils');

const baseUrl = 'https://api.yearn.finance/v1/chains';

const urls = {
  ethereum: `${baseUrl}/1/vaults/all`,
  fantom: `${baseUrl}/250/vaults/all`,
  arbitrum: `${baseUrl}/42161/vaults/all`,
};

const buildPool = (entry, chainString) => {
  const newObj = {
    pool: entry.address,
    chain: utils.formatChain(chainString),
    project: 'yearn-finance',
    symbol: utils.formatSymbol(entry.symbol),
    tvlUsd: entry.tvl.tvl,
    apy: entry.apy.net_apy * 100,
  };
  return newObj;
};

const topLvl = async (chainString) => {
  // pull data
  let data = await utils.getData(urls[chainString]);

  // filter to v2 only
  data = data.filter((el) => el.type === 'v2');

  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async () => {
  const data = await Promise.all([
    topLvl('ethereum'),
    topLvl('fantom'),
    topLvl('arbitrum'),
  ]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://yearn.finance/vaults',
};
