const constants = require('./v2/constants');
const { poolsFunction } = require('./v2/index');

const { pools } = constants;

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.folks.finance/',
};
