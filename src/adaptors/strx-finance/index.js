const utils = require('../utils');

const poolsFunction = async () => {

  const dataTvl = await utils.getData(
    'https://api.llama.fi/tvl/strx-finance'
  );

  const apydata = await utils.getData(
    'https://stakingapi.strx.finance/'
  );
   
  const StakingPool = {
    pool: 'TGrdCu9fu8csFmQptVE25fDzFmPU9epamH',
    chain: utils.formatChain('tron'),
    project: 'strx-finance',
    symbol: utils.formatSymbol('TRX'),
    tvlUsd: dataTvl,
    apy: Number(apydata.apy),
    poolMeta: "Staking Pool"
  };

  return [StakingPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: "https://app.strx.finance",
};