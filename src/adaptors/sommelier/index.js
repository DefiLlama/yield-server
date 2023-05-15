const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const {
  chain,
  rewardTokens,
  stakingPools,
  v0815Pools,
  v0816Pools,
  v2Pools,
} = require('./config');
const v0815 = require('./v0-8-15');
const v0816 = require('./v0-8-16');
const v2 = require('./v2');
const stakingAbi = require('./staking-v0-8-15.json');

const call = sdk.api.abi.call;

// Get the Cellar address from pool notation
// <cellar address>:<network>
function getCellarAddress(pool) {
  return pool.pool.split('-')[0];
}

// Get a list of all Cellar holding positions
async function getHoldingPositions() {
  const v1Assets = await Promise.all(
    v0815Pools.map((pool) =>
      v0815
        .getUnderlyingTokens(getCellarAddress(pool))
        .then((tokens) => tokens[0])
    )
  );

  const v15Assets = await Promise.all(
    v0816Pools.map((pool) => v0816.getHoldingPosition(getCellarAddress(pool)))
  );

  const v2Assets = await Promise.all(
    v2Pools.map((pool) => v2.getHoldingPosition(getCellarAddress(pool)))
  );

  return [...v1Assets, ...v15Assets, ...v2Assets];
}

async function main() {
  const assets = await getHoldingPositions();
  const tokens = ['coingecko:sommelier', ...assets.map((a) => `ethereum:${a}`)];
  const prices = await utils.getPrices(tokens);
  const sommPrice = prices.pricesBySymbol.somm;

  let promises = [];
  promises = v0815Pools.map((pool) => handleV0815(pool, prices));
  promises = promises.concat(
    v0816Pools.map((pool) => handleV0816(pool, prices))
  );
  promises = promises.concat(v2Pools.map((pool) => handleV2(pool, prices)));

  const pools = await Promise.all(promises);

  return pools;
}

async function handleV0815(pool, prices) {
  const cellarAddress = pool.pool.split('-')[0];

  const underlyingTokens = await v0815.getUnderlyingTokens(cellarAddress);
  const asset = underlyingTokens[0]; // v0815 Cellar only holds one asset
  const tvlUsd = await v0815.getTvlUsd(cellarAddress, asset);
  const apyBase = await v0815.getApy(cellarAddress);
  const assetPrice = prices.pricesByAddress[asset.toLowerCase()];
  const apyReward = await getRewardApy(
    stakingPools[cellarAddress],
    prices.pricesBySymbol.somm,
    assetPrice
  );

  return {
    ...pool,
    tvlUsd,
    apyBase,
    apyReward,
    underlyingTokens,
    poolMeta:
      apyReward > 0 ? `${pool.poolMeta} - 3day Bonding Lock` : pool.poolMeta,
  };
}

async function handleV0816(pool, prices) {
  const cellarAddress = pool.pool.split('-')[0];

  const underlyingTokens = await v0816.getUnderlyingTokens(cellarAddress);
  const asset = await v0816.getHoldingPosition(cellarAddress);
  const tvlUsd = await v0816.getTvlUsd(cellarAddress, asset);
  const apyBase = await v0816.getApy(cellarAddress);
  const assetPrice = prices.pricesByAddress[asset.toLowerCase()];
  const apyReward = await getRewardApy(
    stakingPools[cellarAddress],
    prices.pricesBySymbol.somm,
    assetPrice
  );

  return {
    ...pool,
    tvlUsd,
    apyBase,
    apyReward,
    underlyingTokens,
    poolMeta:
      apyReward > 0 ? `${pool.poolMeta} - 3day Bonding Lock` : pool.poolMeta,
  };
}

async function handleV2(pool, prices) {
  const cellarAddress = pool.pool.split('-')[0];

  const underlyingTokens = await v2.getUnderlyingTokens(cellarAddress);
  const asset = await v2.getHoldingPosition(cellarAddress);
  const assetPrice = prices.pricesByAddress[asset.toLowerCase()];

  const apyReward = await getRewardApy(
    stakingPools[cellarAddress],
    prices.pricesBySymbol.somm,
    assetPrice
  );
  const apyBase = await v2.getApy(cellarAddress);
  const apyBase7d = await v2.getApy7d(cellarAddress);

  // getTvlUsd implementation hasn't changed since v1.5 (v0.8.16)
  const tvlUsd = await v0816.getTvlUsd(cellarAddress, asset);

  return {
    ...pool,
    tvlUsd,
    apyBase,
    apyBase7d,
    apyReward,
    underlyingTokens,
    poolMeta:
      apyReward > 0 ? `${pool.poolMeta} - 3day Bonding Lock` : pool.poolMeta,
  };
}

// Calculates Staking APY for v0815 staking contract currently used by all pools
async function getRewardApy(stakingPool, sommPrice, assetPrice) {
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
  let totalDepositsWithBoost = new BigNumber(totalDepositWithBoostResult).div(
    1e18
  );

  totalDepositsWithBoost = totalDepositsWithBoost.times(assetPrice);

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
