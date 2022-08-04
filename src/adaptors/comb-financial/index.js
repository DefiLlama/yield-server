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

  //  {
  // "_id": "62e50431770a5133dbb5d195",
  // "vaultId": "gemFtmUsdc",
  // "apy": 1.294624338699352,
  // "daily": 0.0023062714014054435,
  // "farmApr": 0.8226352701459785,
  // "lpPrice": 21.82383344813886,
  // "tvl": 33750.42784660873,
  // "updatedAt": "2022-08-04T09:18:04.158Z"
  // }

  //const apyBase = utils.aprToApy(tradingApr)*100;

  // Add filtered vault
  addVault('gemFtmUsdc');

  return finalData;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
