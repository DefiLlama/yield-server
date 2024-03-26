const utils = require('../utils');


const getPoolsData = async () => {
  const data = await utils.getData('https://api.return.finance/api/our-pools');
  
  return data.pools.map((pool) => {
    return {
      pool: `${pool.returnContractAddress}-${pool.networkName.toLowerCase()}`,
      chain: pool.networkName,
      project: 'return-finance',
      symbol: pool.poolPair,
      tvlUsd: pool.returnContractTvl / 1000000,
      apyBase: pool.apy,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: getPoolsData,
  url: 'https://return.finance',
};
