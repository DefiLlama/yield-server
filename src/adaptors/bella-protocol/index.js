const utils = require('../utils');
const { getApy } = require('./apy');

const buildPool =
  (chain) =>
  ([name, { strategyApy, distributionApy, tvlUsd, pool }]) => {
    return {
      pool: [pool, chain].join('-'),
      chain: utils.formatChain(chain),
      project: 'bella-protocol',
      symbol: utils.formatSymbol(name.toUpperCase()),
      rewardTokens: ['0xcA7aE36A38eA4dE50DFEeCF6A4c44fC074811a6c'],
      apyBase: strategyApy,
      apyReward: distributionApy,
      tvlUsd,
      url: `https://fs.bella.fi/#/flex-savings/${name.toUpperCase()}`,
    };
  };

const main = async () => {
  const apy = await getApy();
  return Object.entries(apy).map(buildPool('ethereum'));
};

module.exports = {
  timetravel: false,
  apy: main,
};
