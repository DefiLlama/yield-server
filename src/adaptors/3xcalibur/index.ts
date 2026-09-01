const { getApy } = require('./apy');

module.exports = {
  protocolId: '2283',
  timetravel: false,
  apy: getApy,
  url: 'https://app.3xcalibur.com/swap/liquidity/add',
};
