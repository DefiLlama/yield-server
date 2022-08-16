const utils = require('../utils');

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://analytics.ousd.com/api/v1/apr/trailing'
  );
  const dataTvl = await utils.getData(
    'https://api.llama.fi/tvl/origin-dollar'
  );

  const ousd = {
    pool: 'origin-dollar',
    chain: 'Ethereum',
    project: 'origin-dollar',
    symbol: 'OUSD',
    tvlUsd: dataTvl,
    apy: Number(apyData.apy),
  };

  return [ousd];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://ousd.com'
};