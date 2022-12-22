const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const {
  chain,
  rewardTokens,
  stakingPools,
  v0815Pools,
  v0816Pools,
} = require('./config');
const v0815 = require('./v0-8-15');
const v0816 = require('./v0-8-16');
const stakingAbi = require('./staking-v0-8-15.json');

const call = sdk.api.abi.call;

async function main() {
  const sommPrice = (await utils.getPrices(['coingecko:sommelier']))
    .pricesBySymbol.somm;

  let promises = [];
  promises = v0815Pools.map((pool) => handleV0815(pool, sommPrice));
  promises = promises.concat(
    v0816Pools.map((pool) => handleV0816(pool, sommPrice))
  );

  const pools = await Promise.all(promises);

  return pools;
}

async function handleV0815(pool, sommPrice) {
  const cellarAddress = pool.pool.split('-')[0];

  const underlyingTokens = await v0815.getUnderlyingTokens(cellarAddress);
  const asset = underlyingTokens[0]; // v0815 Cellar only holds one asset
  const tvlUsd = await v0815.getTvlUsd(cellarAddress, asset);
  const apyBase = await v0815.getApy(cellarAddress);
  const apyReward = await getRewardApy(stakingPools[cellarAddress], sommPrice);

  return {
    ...pool,
    tvlUsd,
    apyBase,
    apyReward,
    underlyingTokens,
  };
}

async function handleV0816(pool, sommPrice) {
  const cellarAddress = pool.pool.split('-')[0];

  const underlyingTokens = await v0816.getUnderlyingTokens(cellarAddress);
  const asset = await v0816.getHoldingPosition(cellarAddress);
  const tvlUsd = await v0816.getTvlUsd(cellarAddress, asset);
  const apyBase = await v0816.getApy(cellarAddress);
  const apyReward = await getRewardApy(stakingPools[cellarAddress], sommPrice);

  return {
    ...pool,
    tvlUsd,
    apyBase,
    apyReward,
    underlyingTokens,
  };
}

// Calculates Staking APY for v0815 staking contract currently used by all pools
async function getRewardApy(stakingPool, sommPrice) {
  const rewardRateResult = (
    await call({
      target: stakingPool,
      abi: stakingAbi.rewardRate,
      chain,
    })
  ).output;
  const rewardRate = new BigNumber(rewardRateResult).div(1e6);

  const totalDepositWithBoostResult = (
    await call({
      target: stakingPool,
      abi: stakingAbi.totalDepositsWithBoost,
      chain,
    })
  ).output;
  const totalDepositsWithBoost = new BigNumber(totalDepositWithBoostResult).div(
    1e18
  );

  const endTimestampResult = (
    await call({
      target: stakingPool,
      abi: stakingAbi.endTimestamp,
      chain,
    })
  ).output;
  const endTimestamp = parseInt(endTimestampResult, 10) * 1000;
  const isStakingOngoing = Date.now() < endTimestamp;
  if (!isStakingOngoing) {
    return 0;
  }

  const stakingApy = rewardRate
    .times(sommPrice)
    .div(totalDepositsWithBoost)
    .times(365 * 24 * 60 * 60)
    .times(100);

  return stakingApy.toNumber();
}

module.exports = {
  timetravel: false,
  apy: main,
};
