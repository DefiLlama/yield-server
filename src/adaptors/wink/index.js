const utils = require('../utils');

const poolsFunction = async () => {
  const data = await utils.getData(
    'https://wink.finance/api/pool/info'
  );

  const stakingusdw = data['stakingusdw'];
  const stakingwink = data['stakingwink'];
  const savingsusdw = data['savingsusdw'];
  
  return [
    {
        pool: stakingusdw.address,
        chain: utils.formatChain('polygon'),
        project: 'wink',
        symbol: 'LockUSDW',
        tvlUsd: stakingusdw['tvlUsd'],
        apy: stakingusdw['apy'],
    },
    {
        pool: stakingwink.address,
        chain: utils.formatChain('polygon'),
        project: 'wink',
        symbol: 'LockWINK',
        tvlUsd: stakingwink['tvlUsd'],
        apy: stakingwink['apy'],
    },
    {
        pool: savingsusdw.address,
        chain: utils.formatChain('polygon'),
        project: 'wink',
        symbol: 'sUSDW',
        tvlUsd: savingsusdw['tvlUsd'],
        apy: savingsusdw['apy'],
    }
  ]
};

module.exports = {
    timetravel: false,
    apy: poolsFunction, // Main function, returns pools
    url: 'https://wink.finance/', // Link to page with pools (Only required if you do not provide url's for each pool)
};
