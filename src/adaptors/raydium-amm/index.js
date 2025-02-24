const utils = require('../utils');

const API_URL =
  'https://api-v3.raydium.io/pools/info/list?poolType=all&poolSortField=default&sortType=desc&pageSize=1000&page=1';

const apy = async () => {
  const data = (await utils.getData(API_URL)).data.data;

  return data.map((pool) => {
    const apyReward = pool.day.rewardApr.reduce((v, acc) => v + acc, 0);
    return {
      pool: pool.id,
      chain: 'Solana',
      project: 'raydium-amm',
      symbol: `${pool.mintA.symbol}-${pool.mintB.symbol}`,
      tvlUsd: pool.tvl,
      apyBase: pool.day.feeApr,
      apyReward,
      rewardTokens:
        apyReward > 0
          ? pool?.rewardDefaultInfos?.map((r) => r.mint?.address)
          : [],
      apyBase7d: pool.week.feeApr,
      volumeUsd1d: pool.day.volume,
      volumeUsd7d: pool.week.volume,
      poolMeta: `${pool.type} - ${pool.feeRate * 100}%`,
      url:
        pool.type.toLowerCase() === 'concentrated'
          ? `https://raydium.io/clmm/create-position/?pool_id=${pool.id}`
          : `https://raydium.io/liquidity/increase/?mode=add&pool_id=${pool.id}`,
    };
  });
};

module.exports = {
  apy,
};
