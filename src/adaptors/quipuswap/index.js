const { getFarms } = require('./helpers');

const projectName = 'quipuswap';

const poolsFunction = async () =>
  getFarms(
    projectName,
    ({ item: pool }) =>
      pool.stakeStatus === 'ACTIVE' &&
      parseFloat(pool.tvlInUsd) > 10e3 &&
      pool.rewardToken.metadata.name.toLowerCase().includes(projectName)
  );

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
