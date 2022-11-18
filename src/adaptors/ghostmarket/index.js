const utils = require('../utils');

const poolsFunction = async () => {
  const poolData = await utils.getData(
    'https://neo-dashboard.com/json_data/gfund.json'
  );
  console.log(poolData)
  return [poolData]
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://ghostmarket.io/incentives/gfund'
};