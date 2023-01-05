const utils = require('../utils');

const poolsFunction = async () => {
  const poolsData = await utils.getData(
    'http://3.35.241.226:7072/api/apy'
  );

  const pools = poolsData.map((pool) => ({
    pool: pool.pool,
    chain: utils.formatChain('binance'),
    project: 'derify-protocol',
    symbol: pool.symbol,
    tvlUsd: pool.tvlUsd,
    apy: pool.apy * 100,
  }));

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://derify.exchange/earn',
};