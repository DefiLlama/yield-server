const utils = require('../utils');

const poolsFunction = async () => {

  const ffoodData = await utils.getData(
    'https://api.ratalert.com/token?token=FFOOD'
  );
  const cfoodData = await utils.getData(
    'https://api.ratalert.com/token?token=CFOOD'
  );
  const gfoodData = await utils.getData(
    'https://api.ratalert.com/token?token=GFOOD'
  );

  const ffood = {
    pool: '0x2721d859EE8d03599F628522d30f14d516502944',
    chain: utils.formatChain('polygon'),
    project: 'ratalert',
    symbol: utils.formatSymbol('FFOOD'),
    tvlUsd: ffoodData.aum,
    apy: ffoodData.apr // Non-compounding so APY=APR,
  };
  const cfood = {
    pool: '0x33CC3b1852939Ef8CFd77BB5c3707cF2D3E72490',
    chain: utils.formatChain('polygon'),
    project: 'ratalert',
    symbol: utils.formatSymbol('CFOOD'),
    tvlUsd: cfoodData.aum,
    apy: cfoodData.apr // Non-compounding so APY=APR,
  };
  const gfood = {
    pool: '0x57d43Cfe565A2e6C181662aE73A9F1EC6A830351',
    chain: utils.formatChain('polygon'),
    project: 'ratalert',
    symbol: utils.formatSymbol('GFOOD'),
    tvlUsd: gfoodData.aum,
    apy: gfoodData.apr // Non-compounding so APY=APR,
  };

  return [ffood, cfood, gfood]; 
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
