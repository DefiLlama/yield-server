const utils = require('../utils');

const urlApy = 'https://api.beefy.finance/apy';
const urlTvl = 'https://api.beefy.finance/tvl';
// they also have this endpoint with vault id info, ids are not addresses though
// 'https://api.beefy.finance/vaults'

// NOTE(!) some of those sometimes are in the api response, sometimes they aren't...
// need to check with team
const networkMapping = {
  10: 'optimism',
  43114: 'avalanche',
  1666600000: 'harmony',
  42220: 'celo',
  42161: 'arbitrum',
  1285: 'moonriver',
  1088: 'metis',
  250: 'fantom',
  137: 'polygon',
  128: 'heco',
  122: 'fuse',
  56: 'binance',
  25: 'cronos',
};

const apy = (dataTvl, dataApy, networkMapping) => {
  const data = [];
  for (const chain of Object.keys(networkMapping)) {
    poolData = dataTvl[chain];
    for (const pool of Object.keys(poolData)) {
      if (dataApy[pool] === undefined) {
        continue;
      }
      data.push({
        id: `${pool}-${chain}`,
        symbol: pool.split('-').slice(1).join('-'),
        network: chain,
        tvl: poolData[pool],
        apy: dataApy[pool],
      });
    }
  }
  return data;
};

const buildPool = (entry) => {
  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(networkMapping[entry.network]),
    project: 'beefy',
    symbol: utils.formatSymbol(entry.symbol),
    tvlUsd: entry.tvl,
    apy: entry.apy * 100,
  };

  return newObj;
};

const main = async () => {
  // pull data
  const dataApy = await utils.getData(urlApy);
  const dataTvl = await utils.getData(urlTvl);

  // calculate apy
  let data = apy(dataTvl, dataApy, networkMapping);

  // build pool objects
  data = data.map((el) => buildPool(el));

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.beefy.com/',
};
