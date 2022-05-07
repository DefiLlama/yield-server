const utils = require('../utils');

const poolsFunction = async () => {
  const get = await utils.getData('https://api.ellipsis.finance/api/getAPRs');
  const dataAPRs = get.data;  
  const pools = []
  for(const i in dataAPRs) {
    const obj = dataAPRs[i]
    if(parseInt(obj.tvl) > 0)
    pools.push({
      pool: obj.address,
      chain: utils.formatChain('binance'),
      project: 'ellipsis-finance',
      symbol: obj.assets,
      tvlUsd: parseFloat(obj.tvl),
      apy: parseFloat(obj.totalApr),      
    })

  }
  return pools
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};