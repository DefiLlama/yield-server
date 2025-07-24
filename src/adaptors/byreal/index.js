const utils = require('../utils');

const API_URL =
  'https://api2.byreal.io/byreal/api/dex/v1/pools/info/list?pageSize=1000&page=1';

const apy = async () => {
  console.log("start");
  const data = (await utils.getData(API_URL)).result.data.list;

  return data.map((pool) => {
    let apyReward = 0;
    if(pool.rewards != null){
      apyReward = pool.rewards.reduce((acc, v) => Number(v.apr) + acc, 0);
    }
    return {
      pool: pool.poolAddress,
      chain: 'Solana',
      project: 'byreal',
      symbol: `${pool.mintA.symbol}-${pool.mintB.symbol}`,
      tvlUsd: Number(pool.tvl),
      apyBase: Number(pool.apr24h),
      apyReward,
      rewardTokens:
        apyReward > 0
          ? pool.rewards.map(r => r.address)
          : [],
      apyBase7d: Number(pool.apr7d),
      volumeUsd1d: Number(pool.volumeUsd24h),
      volumeUsd7d: Number(pool.week.volumeUsd),
      poolMeta: `Concentrated - ${pool.feeRate * 100}%`,
      url: `http://www.byreal.io/en/create-position?id=${pool.poolAddress}`
    };
  });
};

module.exports = {
  apy,
};