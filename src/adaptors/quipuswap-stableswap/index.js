const { getFarms } = require('./helpers');

const projectName = 'quipuswap-stableswap';

const poolsFunction = async () =>
  getFarms(
    projectName,
    ({ item: pool }) =>
      pool.stakeStatus === 'ACTIVE' &&
      parseFloat(pool.tvlInUsd) > 10e3 &&
      pool.rewardToken.metadata.name.toLowerCase().includes('quipuswap')
  );

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
