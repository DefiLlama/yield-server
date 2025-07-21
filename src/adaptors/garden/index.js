const utils = require('../utils');

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://stakingv2.garden.finance/apy'
  );

  const dataTvl = await utils.getData(
    'https://stakingv2.garden.finance/stakingStats'
  );

  const stakePool = {
    pool: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf-base',
    chain: utils.formatChain('Arbitrum'),
    project: 'garden',
    symbol: utils.formatSymbol('SEED'),
    tvlUsd: Number(dataTvl.data.totalStaked) / 1e18,
    apy: apyData.data,
  };

  return [stakePool]; 
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.garden.finance/stake',
};