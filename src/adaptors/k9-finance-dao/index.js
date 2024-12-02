const utils = require('../utils');

const SHIBARIUM_CHAIN_NAME = 'shibarium';

const API_URL = 'https://adapters.k9finance.com/pools';

const getPoolsData = async () => {
  const poolsResponse = await utils.getData(API_URL);

  const poolsData = poolsResponse.map((pool) => {
    return {
      chain: utils.formatChain(SHIBARIUM_CHAIN_NAME),
      pool: pool.pool,
      symbol: `${utils.formatSymbol(pool.symbol)}`,
      underlyingTokens: [pool.underlying_token],
      rewardTokens: [pool.reward_token],
      tvlUsd: pool.tvlUsd,
      apy: pool.apy,
      project: 'k9-finance-dao',
      poolMeta: 'V2 pool with zap/unzap option (zap fees applied)',
      url: `https://app.k9finance.com/farming/${pool.pool}`,
    };
  });

  return poolsData;
};

module.exports = {
  timetravel: false,
  apy: getPoolsData,
};
