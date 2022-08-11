const utils = require('../utils');

const urlApi = 'https://api.unrekt.net/api/v2/acryptos-asset.json';

const chainMapping = {
  56: 'binance',
  25: 'cronos',
  100: 'xdai',
  250: 'fantom',
  592: 'astar',
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
      if (details.status === 'deprecated') {
        continue;
      }
      data.push({
        id: `acryptos-${chain}${addr}`,
        network: chain,
        symbol: details.tokensymbol,
        tvl: details.tvl_usd,
        apy: details.apytotal,
        platform: details.platform,
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
    symbol: utils.formatSymbol(entry.symbol) + ` (${entry.platform})`,
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
  url: 'https://app-v2.acryptos.com/#/BSC/vaults/all',
};
