const { getApy } = require('./apy');

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.3xcalibur.com/swap/liquidity/add',
};
