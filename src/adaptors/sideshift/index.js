const utils = require('../utils');

const main = async () => {
  const stats = await utils.getData('https://sideshift.ai/api/v2/xai/stats');

  return [
    {
      pool: '0x3808708e761b988d23ae011ed0e12674fb66bd62',
      chain: utils.formatChain('ethereum'),
      project: 'sideshift',
      symbol: utils.formatSymbol('svXAI'),
      tvlUsd: Number(stats.totalValueLocked),
      apy: Number(stats.latestAnnualPercentageYield),
      underlyingTokens: ['0x35e78b3982e87ecfd5b3f3265b601c046cdbe232'],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://sideshift.ai/staking',
};
