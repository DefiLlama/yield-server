const utils = require('../utils');

const STRATEGIES_ENDPOINT = "https://lockers.stakedao.org/api/strategies";

const poolsFunction = async () => {
  const angleStrategies = await utils.getData(
    `${STRATEGIES_ENDPOINT}`
  );

  const curveStrategies = await utils.getData(
    `${STRATEGIES_ENDPOINT}/curve`
  );

  const balancerStrategies = await utils.getData(
    `${STRATEGIES_ENDPOINT}/balancer`
  );

  const allStrats = angleStrategies.concat(curveStrategies).concat(balancerStrategies);

  const strats = [];

  for (const strat of allStrats) {
    strats.push({
      pool: strat.key,
      chain: utils.formatChain('ethereum'),
      project: 'stakedao',
      symbol: utils.formatSymbol(strat.token.symbol),
      tvlUsd: strat.tvlUSD,
      apy: strat.maxApr * 100,
    });
  }

  return strats;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://lockers.stakedao.org/strategies',
};