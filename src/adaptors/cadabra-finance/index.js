const utils = require('../utils');

const networkMapping = {
  1: 'ethereum',
  10: 'optimism',
  25: 'cronos',
  56: 'bsc',
  100: 'gnosis',
  122: 'fuse',
  128: 'heco',
  137: 'polygon',
  169: 'manta',
  250: 'fantom',
  252: 'fraxtal',
  324: 'zksync',
  1088: 'metis',
  1101: 'polygon_zkevm',
  1284: 'moonbeam',
  1285: 'moonriver',
  2222: 'kava',
  5000: 'mantle',
  7700: 'canto',
  8453: 'base',
  34443: 'mode',
  42161: 'arbitrum',
  42220: 'celo',
  42262: 'oasis',
  43114: 'avalanche',
  59144: 'linea',
  1313161554: 'aurora',
  1666600000: 'harmony',
};

const main = async () => {
  const contracts = await utils.getData(
    'https://app.cadabra.finance/api/system/contract'
  );
  const strategies = await utils.getData(
    'https://app.cadabra.finance/api/system/strategies'
  );

  return Object.values(strategies).filter(pool => !pool.isTestStrategy).map((pool) => {
    const apyReward = Number(pool.apr) * 100;
    const chain = networkMapping[pool.chainId]

    const tokens = pool.tokens.map(p => p.address)
    const tokensSymbol = pool.tokens.map(p => p.symbol)

    return {
      pool: `cadabra-${pool.id}-${chain}`.toLowerCase(),
      chain: chain,
      project: 'cadabra-finance',
      symbol: tokensSymbol.join('-'),
      tvlUsd: Number(pool.tvl),
      apyReward,
      url: `https://app.cadabra.finance/strategies/${pool.id.toLowerCase()}/${pool.chainId}`,
      rewardTokens: [contracts.abra[pool.chainId]],
      underlyingTokens: tokens,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: main,
};