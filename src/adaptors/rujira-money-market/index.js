const { getMoneyMarketPools } = require('../rujira-common');

module.exports = {
  protocolId: '8397',
  timetravel: false,
  apy: getMoneyMarketPools,
  url: 'https://rujira.network/lend',
};
