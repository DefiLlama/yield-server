const utils = require('../utils');

const poolsFunction = async () => {
  const poolData = await utils.getData(
    'https://app.earnmos.fi/defi-llama/yields'
  );

  return poolData?.data?.map((poolInfo) => ({
    pool: poolInfo.pool,
    chain: utils.formatChain(poolInfo.chain),
    project: 'earnmos',
    symbol: utils.formatSymbol(poolInfo.symbol),
    tvlUsd: Number(poolInfo.totalValueLock),
    apy: poolInfo.apy * 100,
  }));
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.earnmos.fi/deposit',
};
