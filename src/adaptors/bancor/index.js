const utils = require('../utils');

const urlV2 = 'https://api-v2.bancor.network/pools';
const urlV3 = 'https://api-v3.bancor.network/pools';

const apy = (entry) => {
  entry = { ...entry };
  if (entry.name === null || entry.name === undefined) {
    return;
  }
  const apr = ((entry.fees * 365) / entry.tvl) * 100;
  entry.key = entry.name.replace('/', '-');
  entry.apr = Number.isNaN(apr) ? 0 : apr;

  return entry;
};

const buildPool = (entry, chainString, version) => {
  const newObj = {
    pool:
      version === 'v2'
        ? entry.converter_dlt_id
        : `${entry.poolTokenDltId}-${version}`,
    chain: utils.formatChain(chainString),
    project: 'bancor',
    symbol: utils.formatSymbol(entry.key),
    tvlUsd: entry.tvl,
    apy: entry.apr,
  };
  return newObj;
};

const topLvl = async (chainString, url, version) => {
  // pull data
  let data = (await utils.getData(url)).data;

  if (version === 'v2') {
    data = data.map((p) => ({
      ...p,
      fees: parseFloat(p.fees_24h.usd),
      tvl: parseFloat(p.liquidity.usd),
    }));
  } else {
    data = data.map((p) => ({
      ...p,
      fees: parseFloat(p.fees24h.usd),
      tvl: parseFloat(p.stakedBalance.usd),
    }));
  }

  // calculate apy
  data = data.map((el) => apy(el));

  // build pool objects
  data = data.map((el) => buildPool(el, chainString, version));

  return data;
};

const main = async () => {
  const data = await Promise.all([
    topLvl('ethereum', urlV2, 'v2'),
    topLvl('ethereum', urlV3, 'v3'),
  ]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.bancor.network/earn',
};
