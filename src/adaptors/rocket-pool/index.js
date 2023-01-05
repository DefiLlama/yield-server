const utils = require('../utils');

const poolsFunction = async () => {
  const apyData = await utils.getData('https://api.rocketpool.net/api/apr');
  const dataTvl = await utils.getData(
    'https://api.rocketpool.net/api/mainnet/network/stats'
  );
  const priceUsd = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
  );

  const ethPool = {
    pool: '0xae78736cd615f374d3085123a210448e74fc6393',
    chain: utils.formatChain('ethereum'),
    project: 'rocket-pool',
    symbol: utils.formatSymbol('RETH'),
    tvlUsd: Number(dataTvl.ethStakingTotal) * Number(priceUsd.ethereum.usd),
    apyBase: parseFloat(apyData.yearlyAPR),
  };

  return [ethPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://stake.rocketpool.net/',
};
