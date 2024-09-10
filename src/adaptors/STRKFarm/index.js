const utils = require('../utils');

const apy = async () => {
  const apyData = await utils.getData(
    'https://app.strkfarm.xyz/api/strategies'
  );
  const symbolMap = [
    'STRK',
    'USDC',
    'USDC',
    'ETH',
    'STRK',
  ];
  return apyData.strategies.map((strat, index) => {
    let currTvlUsd = `${strat.tvlUsd}`
    if(currTvlUsd < 10000) return;
    let currPool = `${strat.name}`
    let currSymbol = `${strat.depositToken[0]}`
    let currUnderlyingTokens = `${strat.contract[0].name}`
    let currApy = `${(strat.apy) * 100}`
    return {
        pool: currPool,
        chain: 'Starknet',
        project: 'STRKFarm',
        symbol: symbolMap[index],
        underlyingTokens: currUnderlyingTokens,
        tvlUsd: currTvlUsd,
        apy: currApy,
    };
  })
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.strkfarm.xyz/?tab=strategies',
};