const { getStakingPools } = require('../rujira-common');

module.exports = {
  protocolId: '8394',
  timetravel: false,
  apy: getStakingPools,
  url: 'https://rujira.network/stake',
};
