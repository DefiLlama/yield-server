const utils = require('../utils');

const STRATEGIES_ENDPOINT = "https://lockers.stakedao.org/api/strategies";
const SDT_ADDRESS = "0x73968b9a57c6e53d41345fd57a6e6ae27d6cdb2f";

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

    const rewardTokens = strat?.aprBreakdown?.filter((t) => {
      if (t.token.address === SDT_ADDRESS) {
        return parseFloat(t.maxAprFuture) > 0;
      }

      return t.apr > 0;
    }).map((t) => t.token.address);

    const apyReward = strat?.aprBreakdown?.reduce((acc, t) => {
      if (t.token.address === SDT_ADDRESS) {
        return acc + parseFloat(t.maxAprFuture);
      }

      return acc + t.apr;
    }, 0.0) * 100;

    const apy = strat.maxAprFuture * 100;
    const apyBase = apy - apyReward;

    return acc.concat([{
      pool: strat.key,
      chain: utils.formatChain('ethereum'),
      project: 'stakedao',
      symbol: utils.formatChain(strat.protocol) + "-" + strat.name,
      tvlUsd: strat.tvlUSD,
      apy,
      apyReward,
      apyBase,
      rewardTokens,
    }]);
  }, []);

  return strats;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://lockers.stakedao.org',
};