const utils = require('../utils');

const poolsFunction = async () => {
  const poolsData = await utils.getData(
    'http://api.flamingo.finance/project-info/defillama-yields'
  );

  return poolsData.pools
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://flamingo.finance/earn/overview'
};