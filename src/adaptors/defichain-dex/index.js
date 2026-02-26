const utils = require('../utils');

const API_URL = 'https://ocean.defichain.com/v0/mainnet/poolpairs?size=200';

const DEFICHAIN_COINGECKO = {
  '0': 'coingecko:defichain',
  '1': 'coingecko:ethereum',
  '2': 'coingecko:bitcoin',
  '3': 'coingecko:tether',
  '9': 'coingecko:litecoin',
  '11': 'coingecko:bitcoin-cash',
  '13': 'coingecko:usd-coin',
  '226': 'coingecko:solana',
  '290': 'coingecko:usd-coin'
};

const getApy = async () => {
  const poolsData = await utils.getData(API_URL);

  const pools = poolsData.data.map((pool) => ({
    pool: `${pool.symbol}-defichain`,
    chain: utils.formatChain('defichain'),
    project: 'defichain-dex',
    symbol: pool.symbol,
    tvlUsd: Number(pool.totalLiquidity.usd) || 0,
    apyBase: pool.apr.commission * 100,
    apyReward: pool.apr.reward * 100,
    underlyingTokens: [pool.tokenA?.id, pool.tokenB?.id].filter(Boolean).map(id => DEFICHAIN_COINGECKO[id] || id),
    rewardTokens: ['DFI'],
  }));

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://defichain.com/dex',
};
