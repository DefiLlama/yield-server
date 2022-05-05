const utils = require('../utils');

const url = 'https://api-v2.bancor.network/pools';

const apy = (entry) => {
  entry = { ...entry };
  if (entry.name === null || entry.name === undefined) {
    return;
  }
  const annualiser = 365;
  const numer = Number(entry.fees_24h.usd) * annualiser;
  const denom = Number(entry.liquidity.usd);
  const apr = (numer / denom) * 100;

  entry.key = entry.name.replace('/', '-');
  entry.apr = Number.isNaN(apr) ? 0 : apr;

  return entry;
};

const buildPool = (entry, chainString) => {
  const newObj = {
    pool: entry.converter_dlt_id,
    chain: utils.formatChain(chainString),
    project: 'bancor',
    symbol: utils.formatSymbol(entry.key),
    tvlUsd: entry.liquidity.usd,
    apy: entry.apr,
  };
  return newObj;
};

const topLvl = async (chainString, url) => {
  // pull data
  let data = await utils.getData(url);

  // calculate apy
  data = data.data.map((el) => apy(el));

  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async () => {
  const data = await Promise.all([topLvl('ethereum', url)]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
