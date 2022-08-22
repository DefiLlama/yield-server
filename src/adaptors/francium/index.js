const axios = require('axios');
const utils = require('../utils');

const FARM_FEE = 0.04;
const apiBase = 'https://francium.io/'

function getFarmPoolAPY(target) {
  function aprToApy(apr, n = 365) {
    return (1 + apr / n) ** n - 1;
  }
  function getFarmAPY(yfAPR, tradingFeeAPR, bi) {
    return aprToApy(yfAPR * (1 - FARM_FEE) + tradingFeeAPR) - aprToApy(bi);
  }
  return getFarmAPY(3 * target.yieldFarmingAPR / 100, 3 * target.tradingFeeAPR / 100, -2 * target.borrowAPR / 100) * 100;
}

async function getPoolsData() {
  const [{data: farmPoolData}, {data: lendPoolData}] = await Promise.all([
    axios.get(apiBase + 'api/pools/latest'),
    axios.get(apiBase + 'api/lend/latest'),
  ])

  if ( !farmPoolData.data || !lendPoolData.data ) {
    console.log({farmPoolData, lendPoolData});
    throw new Error('Unexpected response from frcPoolsData');
  }

  const pools = [];

  const latestFarmPools = farmPoolData.data
  const latestLendPools = lendPoolData.data

  latestFarmPools.forEach(item => {
    pools.push({
      pool: item.poolId || `Francium-${item.id}-LYF-${item.type}`,
      chain: utils.formatChain('solana'),
      project: 'francium',
      symbol: utils.formatSymbol(item.pool),
      poolMeta: `Leveraged Yield Farming on ${item.type}`,
      tvlUsd: Number(item.frTvl),
      apyBase: getFarmPoolAPY(item),
    })
  })

  latestLendPools.forEach(item => {
    pools.push({
      pool: item.poolId || `Francium-${item.id}-Lending`,
      chain: utils.formatChain('solana'),
      project: 'francium',
      symbol: utils.formatSymbol(item.id),
      poolMeta: 'Lending Pool',
      tvlUsd: Number(item.liquidityLocked),
      apyBase: item.apy,
    })
  })

  return pools;
}

module.exports = {
  timetravel: false,
  apy: getPoolsData,
  url: 'https://francium.io/app/',
};
