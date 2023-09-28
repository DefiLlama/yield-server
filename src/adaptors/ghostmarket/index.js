const utils = require('../utils');

const poolsFunction = async () => {
  const poolData = await utils.getData(
    'https://api-external.ghostmarket.io/defillama/yield'
  );
  console.log(poolData)
  return [poolData]
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://ghostmarket.io/incentives/gfund'
};