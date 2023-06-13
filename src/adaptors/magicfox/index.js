const utils = require('../utils');

const main = async () => {
  const resData = await utils.getData('https://api.magicfox.fi/all/pool/list/');
  const resPools = resData.pools;

  const pools = resPools.map((pool) => ({
    pool: pool.gauge,
    chain: pool.network,
    project: 'magicfox',
    symbol: pool.title,
    tvlUsd: Number(pool.app === 'swap' ? pool.lpTVL : pool.depositedTVL),
    apy: Number(pool.baseApy + (pool.rewardAPY ?? 0)),
  }));

  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: '',
};
