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

  const collaterals = {};
  market.data.collaterals.forEach((collateral) => {
    collaterals[collateral.coinType] = collateral;
  });

  const arr = [];
  market.data.pools.forEach((pool) => {
    const supplyUsd = parseFloat(pool.supplyCoin) * parseFloat(pool.coinPrice);
    const collateralUsd = parseFloat(collaterals[pool.coinType].depositCoin) * parseFloat(collaterals[pool.coinType].coinPrice);
    const borrowUsd = parseFloat(pool.borrowCoin) * parseFloat(pool.coinPrice);
    arr.push({
      chain: 'Sui',
      project: 'scallop-lend',
      pool: pool.coinType,
      symbol: pool.symbol,
      tvlUsd: supplyUsd + collateralUsd - borrowUsd,
      apyBase: parseFloat(pool.supplyApy * 100),
      apyReward: supplyRewards[pool.coinType] ? parseFloat(supplyRewards[pool.coinType].rewardApr * 100) : null,
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
