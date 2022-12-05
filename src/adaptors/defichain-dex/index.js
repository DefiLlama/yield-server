const utils = require('../utils');

const API_URL = 'https://ocean.defichain.com/v0/mainnet/poolpairs?size=200';

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
    rewardTokens: ['DFI'],
  }));

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://defichain.com/dex',
};
