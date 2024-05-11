const utils = require('../utils');

const dappUrl = 'https://goat.fi';
const url = 'https://api.goat.fi';
const urlApy = `${url}/apy`;
const urlTvl = `${url}/tvl`;
const urlMeta = `${url}/vaults`;

const networkMapping = {
  42161: 'arbitrum',
};

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

      if (!poolMeta) continue;

      const poolId = poolMeta.earnedTokenAddress;
      const isActive = poolMeta.status == 'active';

      const underlyingTokens =
        poolMeta && poolMeta.assets.length === 1 && poolMeta.tokenAddress
          ? [poolMeta.tokenAddress]
          : undefined;

      data.push({
        pool: `${poolId}-${networkMapping[chain]}`.toLowerCase(),
        chain: utils.formatChain(networkMapping[chain]),
        project: 'goat-protocol',
        symbol: utils.formatSymbol(poolMeta?.assets.join('-')),
        tvlUsd: poolData[pool],
        apy: isActive ? apy[pool] * 100 : 0,
        poolMeta:
          platformId === undefined ? null : utils.formatChain(platformId),
        underlyingTokens,
        url: `${dappUrl}/#/${networkMapping[chain].toLowerCase()}/vault/${poolId}`
      });
    }
  }

  return utils.removeDuplicates(data);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://goat.fi/',
};
