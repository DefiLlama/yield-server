const utils = require('../utils');

const API_URL = 'https://api.unknown.money/pools';

const getApy = async () => {
  const poolInfos = await utils.getData(API_URL);
  const pools = poolInfos.filter(e => e.totalApr !== 'N/A').map((item) => {
    return {
      pool: item.id,
      chain: utils.formatChain('binance'),
      project: 'unknown',
      symbol: item.poolData.symbol
        .replaceAll('vAMM-', '')
        .replaceAll('sAMM-', '')
        .split('/').join('-'),
      tvlUsd: Number(item.totalTvlUsd),
      apyReward: Number(item.totalApr),
      rewardTokens: item.rewardTokens.map(e => e.id),
    };
  });
  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://www.unknown.money/',
};
