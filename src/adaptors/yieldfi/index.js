const { parse } = require('date-fns');
const utils = require('../utils');

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://ctrl.yield.fi/t/apy'
  );
  const dataTvl = await utils.getData(
    'https://ctrl.yield.fi/y/ts'
  );

  const priceData = await utils.getData('https://ctrl.yield.fi/y/p');
  const price = parseFloat(priceData.price);

  const yusdPool = {
    pool: '0x1CE7D9942ff78c328A4181b9F3826fEE6D845A97',
    chain: 'ethereum',
    project: 'yieldfi',
    symbol: utils.formatSymbol('yUSD'),
    tvlUsd: parseFloat((parseFloat(dataTvl)*price).toFixed(2)),
    apy: apyData.apy,
  };

  return [yusdPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://yield.fi/mint',
};
