const utils = require('../utils');

const url = 'https://api.stakerz.io';
const urlApy = `${url}/apy`;
const urlTvl = `${url}/tvl`;
const urlMeta = `${url}/vaults`;

const networkMapping = {
  2222: 'kava'
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
      const poolMeta = meta.find((m) => m?.id === pool);
      const platformId = poolMeta?.platformId;

      const poolId = poolMeta.earnedTokenAddress;

      const isActive = poolMeta === undefined || poolMeta.status == 'active';

      if (!poolId) continue;

      data.push({
        pool: `${poolId}-${networkMapping[chain]}`.toLowerCase(),
        chain: utils.formatChain(networkMapping[chain]),
        project: 'stakerz',
        symbol: utils.formatSymbol(pool.split('-').slice(1).join('-')),
        tvlUsd: poolData[pool],
        apy: isActive ? apy[pool] * 100 : 0,
        poolMeta:
          platformId === undefined ? null : utils.formatChain(platformId),
      });
    }
  }

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.stakerz.io/',
};
