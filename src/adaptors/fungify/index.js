const utils = require('../utils');

// Copied Template
const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://api.anchorprotocol.com/api/v1/market/ust'
  );
  const dataTvl = await utils.getData(
    'https://api.anchorprotocol.com/api/v1/deposit'
  );

  const ustPool = {
    pool: 'terra1hzh9vpxhsk8253se0vv5jj6etdvxu3nv8z07zu',
    chain: utils.formatChain('terra'),
    project: 'anchor',
    symbol: utils.formatSymbol('UST'),
    tvlUsd: Number(dataTvl.total_ust_deposits) / 1e6,
    apy: apyData.deposit_apy * 100,
  };

  return [ustPool]; // Anchor only has a single pool with APY
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.anchorprotocol.com/#/earn',
};