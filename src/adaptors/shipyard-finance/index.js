const utils = require('../utils');

const url = 'https://api.shipyard.finance';

const urlApy = `${url}/apy`;
const urlTvl = `${url}/tvl`;
const urlMeta = `${url}/vaults`;

const mapNetworkAndName = {
  1: 'ethereum',
  42161: 'arbitrum',
  43114: 'avalanche',
};

const main = async () => {
  const [apy, tvl, meta] = await Promise.all(
    [urlApy, urlTvl, urlMeta].map((u) => utils.getData(u))
  );

  return Array.from(Object.keys(mapNetworkAndName))

    .map(chain => {

      const poolData = tvl[chain];

      return Array.from(Object.keys(poolData))

        .map(pool => {

          if (apy[pool] === undefined) {
            return null;
          }

          const poolMeta = meta.find((m) => m?.id === pool);

          const poolAddress = poolMeta?.shipTokenAddress;

          if (!poolAddress) {
            return null;
          }

          const platform = poolMeta?.platform;

          return {
            apy: poolMeta.status === 'active' ? apy[pool] * 100 : 0,
            chain: utils.formatChain(mapNetworkAndName[chain]),
            pool: `${poolAddress}-${mapNetworkAndName[chain]}`.toLowerCase(),
            poolMeta: platform === undefined ? null : utils.formatChain(platform),
            project: 'shipyard-finance',
            symbol: utils.formatSymbol(pool.split('-').slice(1).join('-')),
            tvlUsd: poolData[pool],
          };

        })

        .filter(item => item !== null)
    })

    .flatMap(item => item)
};

module.exports = {
  timetravel: false,
  apy: main,
  url
};
