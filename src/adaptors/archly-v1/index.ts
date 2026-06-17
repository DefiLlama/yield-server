const { getApy } = require('./apy');

module.exports = {
  protocolId: '2317',
  timetravel: false,
  apy: getApy,
  url: 'https://archly.fi/liquidity',
};
