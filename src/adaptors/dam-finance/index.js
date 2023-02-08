const utils = require('../utils');

const poolsFunction = async () => {

  const factoriesData = await utils.getData(
    'https://api.curve.fi/api/getPools/moonbeam/factory'
  );
  const factoriesList = factoriesData.data.poolData
  const damData = factoriesList.find((factory) => factory.id == 'factory-v2-18');

  const d2oxcUSDTpool = {
    pool: damData.name,
    chain: 'moonbeam',
    project: 'dam-finance',
    symbol: 'd2o-USDT',
    tvlUsd: damData.usdTotal,
    apy: damData.gaugeRewards[0].apy,
  };

  return [d2oxcUSDTpool];
};

poolsFunction()

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://curve.fi/#/moonbeam/pools/factory-v2-18/',
};