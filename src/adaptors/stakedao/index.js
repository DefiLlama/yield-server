const utils = require('../utils');

const STRATEGIES_ENDPOINT = "https://lockers.stakedao.org/api/strategies";

const poolsFunction = async () => {
  const resp = await Promise.all([
    utils.getData(`${STRATEGIES_ENDPOINT}`),
    utils.getData(`${STRATEGIES_ENDPOINT}/curve`),
    utils.getData(`${STRATEGIES_ENDPOINT}/balancer`)
  ]);
  const angleStrategies = resp[0];
  const curveStrategies = resp[1];
  const balancerStrategies = resp[2];

  const allStrats = angleStrategies.concat(curveStrategies).concat(balancerStrategies);

  const strats = allStrats.reduce((acc, strat) => {
    return acc.concat([{
      pool: strat.key,
      chain: utils.formatChain('ethereum'),
      project: 'stakedao',
      symbol: utils.formatChain(strat.protocol) + " " + strat.name,
      tvlUsd: strat.tvlUSD,
      apy: strat.maxApr * 100,
    }]);
  }, []);

  return strats;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://lockers.stakedao.org',
};