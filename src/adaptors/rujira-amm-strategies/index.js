const { getCclPools } = require('../rujira-common');

module.exports = {
  protocolId: '8396',
  timetravel: false,
  apy: getCclPools,
  url: 'https://rujira.network/trade',
};
