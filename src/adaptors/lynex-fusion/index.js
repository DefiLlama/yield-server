const utils = require('../utils');

const TVL_FILTER = 10000

const getApy = async () => {
  const fusions = await utils.getData('https://api.lynex.fi/api/v1/fusions');
  if (fusions) {
    const filteredFusions = fusions.data.filter(
      (fusion) => fusion.gauge.tvl > TVL_FILTER
    );

    const returnData = filteredFusions.map((fusion) => {
      let tvl = 0;
      let rewardsTokens = [];
      let rewardsApy = 0;
      let fusionSymbol = '';
      try {
        tvl = fusion.totalSupply * fusion.lpPrice;
        fusionSymbol = fusion.symbol.split(' ')[0];
        fusion.extraRewards.map((reward) => {
          rewardsTokens.push(reward.tokenAddress);
          rewardsApy = rewardsApy + reward.apr;
        });
        return {
          pool: `${fusionSymbol}-${fusion.address}-linea`,
          chain: utils.formatChain('linea'),
          project: 'lynex-fusion',
          symbol: fusionSymbol,
          tvlUsd: tvl,
          apyBase: fusion.gauge.minApr,
          apyReward: rewardsApy || null,
          rewardTokens: rewardsTokens.length > 0 ? rewardsTokens : null,
          underlyingTokens: [fusion.token0.address, fusion.token1.address],
        };
      } catch {
        console.log('Oops! Something went wrong...');
        return null;
      }
    });
    return returnData;
  }
  console.log('Error while fetching fusions');
  return null;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.lynex.fi/liquidity',
};
