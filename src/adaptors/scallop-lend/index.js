const axios = require('axios');
const baseUrl = 'https://sdk.api.scallop.io/api';
const marketEndpoint = `${baseUrl}/market`;
const spoolsEndpoint = `${baseUrl}/spools`;

const main = async () => {
  let [market, spools] = await Promise.all([axios.get(marketEndpoint), axios.get(spoolsEndpoint)]);

  const supplyRewards = {};
  spools.data.spools.forEach((spool) => {
    supplyRewards[spool.coinType] = {
      rewardApr: spool.rewardApr,
      rewardCoinType: spool.rewardCoinType,
    };
  });

  const arr = [];
  market.data.pools.forEach((pool) => {
    arr.push({
      chain: 'Sui',
      project: 'scallop-lend',
      pool: pool.coinType,
      symbol: pool.symbol,
      tvlUsd: parseFloat(pool.supplyCoin) * parseFloat(pool.coinPrice) - parseFloat(pool.borrowCoin) * parseFloat(pool.coinPrice),
      apyBase: parseFloat(pool.supplyApy),
      apyReward: supplyRewards[pool.coinType] ? parseFloat(supplyRewards[pool.coinType].rewardApr) : null,
      rewardTokens: supplyRewards[pool.coinType] ? [supplyRewards[pool.coinType].rewardCoinType] : [],
    });
  });

  return arr;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.scallop.io/',
};
