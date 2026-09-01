const { getFarms } = require('../quipuswap-stableswap/helpers');

const projectName = 'kolibri';

const poolsFunction = async () =>
  getFarms(
    projectName,
    ({ item: pool }) =>
      pool.stakeStatus === 'ACTIVE' &&
      parseFloat(pool.tvlInUsd) > 10e3 &&
      pool.rewardToken.metadata.name.toLowerCase().includes(projectName)
  );

module.exports = {
  protocolId: '517',
  timetravel: false,
  apy: poolsFunction,
};
