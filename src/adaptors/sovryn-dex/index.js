const utils = require('../utils');
const pools = require('./address')





const getApy = async () => {
  const dataPool = [];
  const amm_pools_data = await utils.getData(
    `https://amm-apy.sovryn.app/amm`
  );
  const data = await Promise.all(
    Object.keys(pools).map(async (k) =>  {
          var symbol = String(pools[k]);
          var pool_id = String(k.toLowerCase())
          var tvlUsd = await getTvlPool(pool_id)
          var apyData = amm_pools_data[k].data
          var apyDataArray = apyData[Object.keys(apyData)[0]]
          var apy = apyDataArray[apyDataArray.length - 1]
        dataPool.push({
                  pool: pool_id,
                  chain: utils.formatChain('Rootstock'),
                  project: 'sovryn-dex',
                  tvlUsd: tvlUsd,
                  symbol: symbol,  
                  apyBase: Number(apy.APY_pc),
                  apyReward: Number(apy.APY_rewards_pc),
                  rewardTokens: ['0xefc78fc7d48b64958315949279ba181c2114abbd']
                });
            
   
        })
      );
  
  return dataPool

  };

const getTvlPool = async (pool_id) => {
  const tvlData = []; 
  const { tvlAmm } = await utils.getData('https://graph-wrapper.sovryn.app/cmc/tvl') 
  await Promise.all(Object.entries(tvlAmm).map(async (k) => {
      if (k[1].contract == pool_id){
        tvlData.push(k[1].balanceUsd)
      }
    }))
    const tvlPoolUsd = Number(tvlData[0]) + Number(tvlData[1])
    return tvlPoolUsd
}

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://alpha.sovryn.app'
};
