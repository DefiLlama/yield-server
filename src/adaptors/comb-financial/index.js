const utils = require('../utils');
const mappings = require('./mappings.json');

const rewardToken = '0xaE45a827625116d6C0C40B5D7359EcF68F8e9AFD'; //COMB Token

const getSymbol = (poolId) => mappings.find(pool => pool.pool === poolId)?.symbol;
const getTokens = (poolId) => mappings.find(pool => pool.pool === poolId)?.tokens;

const poolsFunction = async () => {
  data = await utils.getData('http://comb-breakdown.herokuapp.com/pools');

  let finalData = [];

  data.map((pool) => {
    const { poolId, tvl: tvlUsd, tradingApr, poolApr } = pool;

    const apyBase = utils.aprToApy(tradingApr);
    const apyReward = utils.aprToApy(poolApr);

    finalData.push({ pool: poolId, chain: 'Fantom', project: 'comb-financial', symbol: getSymbol(poolId), tvlUsd, apyBase, apyReward, rewardTokens: [rewardToken], underlyingTokens: getTokens(poolId)  });
  });


  return finalData;
};


module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
