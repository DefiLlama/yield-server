const utils = require('../utils');

const url = 'https://api.circuit.farm';
const urlApy = `${url}/apy`;
const urlTvl = `${url}/tvl`;
const urlMeta = `${url}/vaults`;

const networkMapping = {
    5000: 'mantle',
}

const crctMapping = {
    5000: '0x0000000000000000000000000000000000000000'
}


const main = async () => {
  const [apy, tvl, meta] = await Promise.all(
    [urlApy, urlTvl, urlMeta].map((u) => utils.getData(u))
  );

  let data = [];
  for (const chain of Object.keys(networkMapping)) {
    const poolData = tvl[chain];
    for (const pool of Object.keys(poolData)) {
      if (apy[pool] === undefined) {
        continue;
      }
      const poolMeta = meta.find((m) => m?.id === pool);
      const platformId = poolMeta?.platformId;

      const poolId =
        poolMeta === undefined
          ? crctMapping[chain]
          : poolMeta.earnedTokenAddress;

      const isActive = poolMeta === undefined || poolMeta.status == 'active';

      if (!poolId) continue;

      const underlyingTokens = (!!poolMeta && poolMeta.assets.length === 1 && poolMeta.tokenAddress) ? [poolMeta.tokenAddress] : undefined;

      data.push({
        pool: `${poolId}-${networkMapping[chain]}`.toLowerCase(),
        chain: utils.formatChain(networkMapping[chain]),
        project: 'circuit-protocol',
        symbol:
          poolMeta === undefined
            ? 'CRCT'
            : utils.formatSymbol(poolMeta?.assets.join('-')),
        tvlUsd: poolData[pool],
        apy: isActive ? apy[pool] * 100 : 0,
        poolMeta:
          platformId === undefined ? null : utils.formatChain(platformId),
        underlyingTokens,
      });
    }
  }

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://circuit.farm/',
};
