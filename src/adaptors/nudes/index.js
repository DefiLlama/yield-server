const utils = require('../utils');

const poolsFunction = async () => {
  const poolsData = await utils.getData(
    'https://api-v2-de1.nudes.army/project-info/defillama-yields'
  );

  return poolsData.pools
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://nudes.army/single-stake'
};