const utils = require('../utils');

const urlApi = 'https://api.unrekt.net/api/v2/acryptos-asset.json';

const chainMapping = {
  56: 'binance',
  25: 'cronos',
  250: 'fantom',
  1284: 'moonbeam',
  1285: 'moonriver',
  43114: 'avalanche',
  1666600000: 'harmony',
};

const fetch = (dataTvl, chainMapping) => {
  const data = [];
  
  for (const chain of Object.keys(chainMapping)) {
    poolData = dataTvl[chain];

    for (const [addr, details] of Object.entries(poolData)) {
      data.push({
        id: `acryptos-${chain}${addr}`,
        network: chain,
        symbol: details.tokensymbol,
        tvl: details.tvl_usd,
        apy: details.apytotal,
      });
    }
  }
  return data;
};


const buildObject = (entry) => {
  const payload = {
    pool: entry.id,
    chain: utils.formatChain(chainMapping[entry.network]),
    project: 'acryptos',
    symbol: utils.formatSymbol(entry.symbol),
    tvlUsd: Number(entry.tvl),
    apy: Number(entry.apy),
  };

  return payload;
};

const main = async () => {
  // pull data
  const dataApi = await utils.getData(urlApi);
  
  let data = fetch(dataApi.assets, chainMapping);

  // build pool objects
  data = data.map((el) => buildObject(el));

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
};

