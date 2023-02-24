const { getApy } = require('./apy');

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://archly.fi/liquidity',
};
