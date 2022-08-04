const utils = require('../utils');
const mappings = require('./mappings.json');

const rewardToken = '0xaE45a827625116d6C0C40B5D7359EcF68F8e9AFD'; //COMB Token

let finalData = [];

const getSymbol = (poolId) =>
  mappings.find((pool) => pool.pool === poolId)?.symbol;
const getTokens = (poolId) =>
  mappings.find((pool) => pool.pool === poolId)?.tokens;

const addVault = (id) => {
  filteredVault = vaultData.find((vault) => vault.vaultId === id);
  const { vaultId, tvl: tvlUsd, farmApr, apy } = filteredVault;

  const apyReward = utils.aprToApy(farmApr) * 100;
  const apyBase = apy * 100; // convert endpoint APY value to %
  
  finalData.push({
    pool: vaultId,
    chain: 'Fantom',
    project: 'comb-financial',
    symbol: getSymbol(vaultId),
    tvlUsd,
    apyBase,
    apyReward,
    rewardTokens: [rewardToken],
    underlyingTokens: getTokens(vaultId),
  });
};

const poolsFunction = async () => {
  poolData = await utils.getData('http://comb-breakdown.herokuapp.com/pools');
  vaultData = await utils.getData(
    'https://comb-breakdown.herokuapp.com/vaults'
  );

  poolData.map((pool) => {
    const { poolId, tvl: tvlUsd, tradingApr, poolApr } = pool;

    const apyBase = utils.aprToApy(tradingApr) * 100;
    const apyReward = utils.aprToApy(poolApr) * 100;

    finalData.push({
      pool: poolId,
      chain: 'Fantom',
      project: 'comb-financial',
      symbol: getSymbol(poolId),
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: [rewardToken],
      underlyingTokens: getTokens(poolId),
    });
  });

  // Add filtered vault
  addVault('gemFtmUsdc');

  return finalData;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
