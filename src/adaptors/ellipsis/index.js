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
      chain: 'binance',
      project: 'Ellipsis Finance',
      symbol: obj.assets,
      tvlUsd: parseInt(obj.tvl),
      apy: parseFloat(parseFloat(obj.totalApr).toFixed(2)),      
    })

  }
  return pools
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};