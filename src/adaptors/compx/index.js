const utils = require('../utils');

const poolsFunction = async () => {
  const pools = await utils.getData(
    'https://api-general.compx.io/api/defillama/yield-farms'
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.compx.io/farms',
};
