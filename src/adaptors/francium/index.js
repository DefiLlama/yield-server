const axios = require('axios');
const utils = require('../utils');

const FARM_FEE = 0.04;
const apiBase = 'https://francium-data.s3-us-west-2.amazonaws.com/';

function getFarmPoolAPY(target) {
  function aprToApy(apr, n = 365) {
    return (1 + apr / n) ** n - 1;
  }
  function getFarmAPY(yfAPR, tradingFeeAPR, bi) {
    return aprToApy(yfAPR * (1 - FARM_FEE) + tradingFeeAPR) - aprToApy(bi);
  }
  return (
    getFarmAPY(
      (3 * target.yieldFarmingAPR) / 100,
      (3 * target.tradingFeeAPR) / 100,
      (-2 * target.borrowAPR) / 100
    ) * 100
  );
}

async function getPoolsData() {
  const [{ data: farmPoolData }, { data: lendPoolData }] = await Promise.all([
    axios.get(apiBase + 'pools/latest.json'),
    axios.get(apiBase + 'lend/latest.json'),
  ]);

  if (!farmPoolData || !lendPoolData) {
    // console.log({farmPoolData, lendPoolData});
    throw new Error('Unexpected response from frcPoolsData');
    return;
  }

  const pools = [];

  const latestFarmPools = farmPoolData.filter((item) => item.poolId);
  const latestLendPools = lendPoolData.filter((item) => item.poolId);

  latestFarmPools.forEach((item) => {
    pools.push({
      pool: item.poolId,
      chain: utils.formatChain('solana'),
      project: 'francium',
      symbol: utils.formatSymbol(item.pool),
      tvlUsd: Number(item.frTvl),
      apyBase: getFarmPoolAPY(item),
      url: 'https://francium.io/app/invest/farm',
    });
  });

  latestLendPools.forEach((item) => {
    pools.push({
      pool: item.poolId,
      chain: utils.formatChain('solana'),
      project: 'francium',
      symbol: utils.formatSymbol(item.id),
      tvlUsd: Number(item.available),
      apyBase: item.apy,
      url: 'https://francium.io/app/lend',
    });
  });

  return pools;
}

module.exports = {
  timetravel: false,
  apy: getPoolsData,
};
