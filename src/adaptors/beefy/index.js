const utils = require('../utils');

const url = 'https://api.beefy.finance';
const urlApy = `${url}/apy`;
const urlTvl = `${url}/tvl`;
const urlMeta = `${url}/vaults`;

const networkMapping = {
  1: 'ethereum',
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
  1284: 'moonbeam',
  42262: 'oasis',
  1313161554: 'aurora',
};

// hardcode bifi token addresses per chain
const bifiMapping = {
  1: '0x5870700f1272a1AdbB87C3140bD770880a95e55D',
  10: '0x4E720DD3Ac5CFe1e1fbDE4935f386Bb1C66F4642',
  43114: '0xd6070ae98b8069de6B494332d1A1a81B6179D960',
  1666600000: '0x6ab6d61428fde76768d7b45d8bfeec19c6ef91a8',
  42220: '0x639A647fbe20b6c8ac19E48E2de44ea792c62c5C',
  42161: '0x99C409E5f62E4bd2AC142f17caFb6810B8F0BAAE',
  1285: '0x173fd7434B8B50dF08e3298f173487ebDB35FD14',
  1088: '0xe6801928061CDbE32AC5AD0634427E140EFd05F9',
  250: '0xd6070ae98b8069de6b494332d1a1a81b6179d960',
  137: '0xFbdd194376de19a88118e84E279b977f165d01b8',
  128: '0x765277eebeca2e31912c9946eae1021199b39c61',
  122: '0x2bF9b864cdc97b08B6D79ad4663e71B8aB65c45c',
  56: '0xCa3F508B8e4Dd382eE878A314789373D80A5190A',
  25: '0xe6801928061CDbE32AC5AD0634427E140EFd05F9',
  1284: '0x595c8481c48894771CE8FaDE54ac6Bf59093F9E8',
  42262: '0x65e66a61D0a8F1e686C2D6083ad611a10D84D97A',
  1313161554: '0x218c3c3D49d0E7B37aff0D8bB079de36Ae61A4c0',
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

      const poolId =
        poolMeta === undefined
          ? bifiMapping[chain]
          : poolMeta.earnedTokenAddress;

      const isActive = poolMeta === undefined || poolMeta.status == 'active';

      if (!poolId) continue;

      const underlyingTokens =
        !!poolMeta && poolMeta.assets.length === 1 && poolMeta.tokenAddress
          ? [poolMeta.tokenAddress]
          : undefined;

      data.push({
        pool: `${poolId}-${networkMapping[chain]}`.toLowerCase(),
        chain: utils.formatChain(networkMapping[chain]),
        project: 'beefy',
        symbol:
          poolMeta === undefined
            ? 'BIFI'
            : utils.formatSymbol(poolMeta?.assets.join('-')),
        tvlUsd: poolData[pool],
        apy: isActive ? apy[pool] * 100 : 0,
        poolMeta:
          platformId === undefined ? null : utils.formatChain(platformId),
        underlyingTokens,
      });
    }
  }

  return utils.removeDuplicates(data);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.beefy.com/',
};
