const axios = require('axios');
const utils = require('../utils')

const baseUrl = 'https://sdk.api.scallop.io/api';
const marketEndpoint = `${baseUrl}/market/migrate`;
const spoolsEndpoint = `${baseUrl}/spools`;
const borrowIncentiveEndpoint = `${baseUrl}/borrowIncentivePools`;

const main = async () => {
  let [market, spools] = await Promise.all([
    axios.get(marketEndpoint),
    axios.get(spoolsEndpoint),
  ]);
  let borrowIncentive;
  try {
    borrowIncentive = await axios.get(borrowIncentiveEndpoint);
  } catch (e) {
    borrowIncentive = { data: [] };
  }

  const supplyRewards = {};
  const rewardTokenPool = {};
  spools.data.spools.forEach((spool) => {
    if(spool.rewardApr <= 0) {
      return;
    }
    supplyRewards[spool.coinType] = {
      rewardApr: spool.rewardApr,
      rewardCoinType: spool.rewardCoinType,
    };
    if(rewardTokenPool[spool.coinType] === undefined) {
      rewardTokenPool[spool.coinType] = [];
    }
    rewardTokenPool[spool.coinType].push(spool.rewardCoinType);
  });

  const borrowRewards = {};
  borrowIncentive.data.forEach((borrow) => {
    borrow.rewards.forEach((reward) => {
      if (borrowRewards[borrow.coinType] === undefined) {
        borrowRewards[borrow.coinType] = [];
      }
      borrowRewards[borrow.coinType].push({
        rewardApr: reward.rewardApr,
        rewardCoinType: reward.coinType,
      });
      if(rewardTokenPool[borrow.coinType] === undefined) {
        rewardTokenPool[borrow.coinType] = [];
      }
      rewardTokenPool[borrow.coinType].push(reward.coinType);
    });
  });

  const arr = [];
  market.data.pools.forEach((pool) => {
    const supplyUsd = parseFloat(pool.supplyCoin) * parseFloat(pool.coinPrice);
    const borrowUsd = parseFloat(pool.borrowCoin) * parseFloat(pool.coinPrice);
    const tvlUsd = supplyUsd - borrowUsd;
    const maxBorrowUsd = parseFloat(pool.maxBorrowCoin) * parseFloat(pool.coinPrice);
    const availableBorrowUsd = Math.max(Math.min(tvlUsd, maxBorrowUsd - borrowUsd), 0);
    const collateralFactor = market.data.collaterals.find((collateral) => collateral.coinType === pool.coinType);
    arr.push({
      chain: 'Sui',
      project: 'scallop-lend',
      pool: pool.coinType,
      symbol: pool.symbol,
      tvlUsd,
      apyBase: parseFloat(pool.supplyApy * 100),
      apyReward: supplyRewards[pool.coinType] ? parseFloat(supplyRewards[pool.coinType].rewardApr * 100) : null,
      rewardTokens: rewardTokenPool[pool.coinType] ? Array.from(new Set(rewardTokenPool[pool.coinType])) : null,
      totalSupplyUsd: supplyUsd,
      totalBorrowUsd: borrowUsd,
      availableBorrowUsd,
      apyBaseBorrow: parseFloat(pool.borrowApy * 100),
      apyRewardBorrow: borrowRewards[pool.coinType] ? parseFloat(borrowRewards[pool.coinType].reduce((prev, curr) => prev + curr.rewardApr, 0) * 100) : null,
      borrowToken: pool.coinType,
      ltv: Number(parseFloat(collateralFactor ? collateralFactor.collateralFactor : 0).toFixed(2)),
      borrowable: parseFloat(pool.maxBorrowCoin) > 0,
      underlyingTokens: [pool.coinType],
    });
  });

  return utils.removeDuplicates(arr)
};

module.exports = {
  protocolId: '1961',
  timetravel: false,
  apy: main,
  url: 'https://app.scallop.io/',
};
