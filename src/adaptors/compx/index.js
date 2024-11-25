const utils = require('../utils');

const poolsFunction = async () => {
  return await utils.getData(
    'https://api-general.compx.io/api/defillama/yield-farms'
  );
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.compx.io/farms',
};
