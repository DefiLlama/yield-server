const utils = require('../utils');

const url = 'https://api.beefy.finance';
const urlApy = `${url}/apy`;
const urlTvl = `${url}/tvl`;
const urlMeta = `${url}/vaults`;

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

const main = async () => {
  const [apy, tvl, meta] = await Promise.all(
    [urlApy, urlTvl, urlMeta].map((u) => utils.getData(u))
  );

  let data = [];
  for (const chain of Object.keys(networkMapping)) {
    poolData = tvl[chain];
    for (const pool of Object.keys(poolData)) {
      if (apy[pool] === undefined) {
        continue;
      }
      let poolMeta = meta.find((m) => m?.id === pool)?.platformId;
      data.push({
        pool: `${pool}-${chain}`,
        chain: utils.formatChain(networkMapping[chain]),
        project: 'beefy',
        symbol: utils.formatSymbol(pool.split('-').slice(1).join('-')),
        tvlUsd: poolData[pool],
        apy: apy[pool] * 100,
        poolMeta: poolMeta === undefined ? null : utils.formatChain(poolMeta),
      });
    }
  }

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.beefy.com/',
};
