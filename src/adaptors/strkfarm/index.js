const utils = require('../utils');

const apy = async () => {
  const apyData = await utils.getData(
    'https://app.strkfarm.com/api/strategies'
  );

  return apyData.strategies
    .filter(strategy => parseFloat(strategy.tvlUsd) > 10000)
    .map((strategy) => {
      const currTvlUsd = parseFloat(strategy.tvlUsd);
      const currPool = strategy.name;
      const currPoolId = strategy.id;
      const baseApy = (strategy.apySplit.baseApy || 0) * 100;
      const rewardsApy = (strategy.apySplit.rewardsApy || 0) * 100;
      const rewardTokens = strategy.depositToken.map(token => token.address);
      const underlyingTokens = strategy.depositToken.map(token => token.address);
      const symbols = strategy.depositToken.map(token => token.symbol).join('-');

      return {
        pool: currPoolId,
        chain: 'Starknet',
        project: 'strkfarm',
        symbol: symbols,
        underlyingTokens: underlyingTokens,
        tvlUsd: currTvlUsd,
        apyBase: baseApy,
        apyReward: rewardsApy,
        rewardTokens: rewardTokens,
        url: `https://app.strkfarm.com/strategy/${currPoolId}`,
        poolMeta: currPool,
      };
    });
};

apy().then((strategies) => {
  strategies.forEach((strategy) => {
    console.log(strategy);
    console.log('-----------------------------');
  });
}).catch((error) => {
  console.error('Error fetching strategies:', error);
});

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.strkfarm.com/?tab=strategies',
};
