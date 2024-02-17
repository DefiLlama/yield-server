const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const {
  stakingPools,
  v0815Pools,
  v0816Pools,
  v2Pools,
  v2p5Pools,
  v2p6Pools,
} = require('./config');
const v0815 = require('./v0-8-15');
const v0816 = require('./v0-8-16');
const v2 = require('./v2');
const v2p5 = require('./v2p5');
const v2p6 = require('./v2p6');
const stakingAbi = require('./staking-v0-8-15.json');

const call = sdk.api.abi.call;

// Get the Cellar address from pool notation
// <cellar address>:<network>
function getCellarAddress(pool) {
  return pool.pool.split('-')[0];
}

function getCellarChain(pool) {
  return pool.pool.split('-')[1];
}

// Get a list of all Cellar holding positions
async function getHoldingPositions() {
  const v1Assets = await Promise.all(
    v0815Pools.map((pool) =>
      v0815
        .getUnderlyingTokens(getCellarAddress(pool), getCellarChain(pool))
        .then((tokens) => tokens[0])
    )
  );

  const v15Assets = await Promise.all(
    v0816Pools.map((pool) => v0816.getHoldingPosition(getCellarAddress(pool), getCellarChain(pool)))
  );

  const v2Assets = await Promise.all(
    v2Pools.map((pool) => v2.getHoldingPosition(getCellarAddress(pool), getCellarChain(pool)))
  );

  const v2p5Assets = await Promise.all(
    v2p5Pools.map((pool) => v2p5.getHoldingPosition(getCellarAddress(pool), getCellarChain(pool)))
  );

  const v2p6Assets = await Promise.all(
    v2p6Pools.map((pool) => v2p6.getHoldingPosition(getCellarAddress(pool), getCellarChain(pool)))
  );

  const deduped = new Set([
    ...v1Assets,
    ...v15Assets,
    ...v2Assets,
    ...v2p5Assets,
    ...v2p6Assets,
  ]);

  return Array.from(deduped);
}

async function main() {
  // Grab all holding positions across all cellars
  const assets = await getHoldingPositions();

  // List of holding position tokens and sommelier token
  // ! Remember to add mapping for each chain 
  const tokens = [
    'coingecko:sommelier',
    ...assets.flatMap((a) => [`ethereum:${a}`, `arbitrum:${a}`]),
  ];

  // Fetch prices for all assets upfront
  const prices = await utils.getPrices(tokens);
  const sommPrice = prices.pricesBySymbol.somm;

  let promises = [];
  // Calculate TVL, APRs (with rewards if applicable) for each cellar version
  // V1
  promises = v0815Pools.map((pool) => handleV0815(pool, prices));

  // V1.5
  promises = promises.concat(
    v0816Pools.map((pool) => handleV0816(pool, prices))
  );

  // V2
  promises = promises.concat(v2Pools.map((pool) => handleV2(pool, prices)));

  // V2.5
  promises = promises.concat(v2p5Pools.map((pool) => handleV2p5(pool, prices)));

  // V2.6
  promises = promises.concat(v2p6Pools.map((pool) => handleV2p6(pool, prices)));

  const pools = await Promise.all(promises);

  return pools;
}

async function handleV0815(pool, prices) {
  const cellarAddress = pool.pool.split('-')[0];
  const cellarChain = pool.pool.split('-')[1];

  const underlyingTokens = await v0815.getUnderlyingTokens(
    cellarAddress,
    cellarChain
  );
  const asset = underlyingTokens[0]; // v0815 Cellar only holds one asset
  const tvlUsd = await v0815.getTvlUsd(cellarAddress, asset, cellarChain);
  const apyBase = await v0815.getApy(cellarAddress, cellarChain);
  const assetPrice = prices.pricesByAddress[asset.toLowerCase()];
  const apyReward = await getRewardApy(
    stakingPools[cellarChain][cellarAddress],
    prices.pricesBySymbol.somm,
    assetPrice,
    cellarChain
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
  const cellarChain = pool.pool.split('-')[1]; 
  const underlyingTokens = await v0816.getUnderlyingTokens(cellarAddress, cellarChain);
  const asset = await v0816.getHoldingPosition(cellarAddress, cellarChain);
  const tvlUsd = await v0816.getTvlUsd(cellarAddress, asset, cellarChain);
  const apyBase = await v0816.getApy(cellarAddress, cellarChain);
  const assetPrice = prices.pricesByAddress[asset.toLowerCase()];
  const apyReward = await getRewardApy(
    stakingPools[cellarChain][cellarAddress],
    prices.pricesBySymbol.somm,
    assetPrice,
    cellarChain
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
  const cellarChain = pool.pool.split('-')[1]; 
  const underlyingTokens = await v2.getUnderlyingTokens(cellarAddress, cellarChain);

  return handleV2plus(pool, prices, underlyingTokens);
}

async function handleV2p5(pool, prices) {
  const cellarAddress = pool.pool.split('-')[0];
  const cellarChain = pool.pool.split('-')[1]; 
  const underlyingTokens = await v2p5.getUnderlyingTokens(cellarAddress, cellarChain);

  return handleV2plus(pool, prices, underlyingTokens);
}

async function handleV2p6(pool, prices) {
  const cellarAddress = pool.pool.split('-')[0];
  const cellarChain = pool.pool.split('-')[1]; 

  const underlyingTokens = await v2p6.getUnderlyingTokens(cellarAddress, cellarChain);

  return handleV2plus(pool, prices, underlyingTokens);
}

async function handleV2plus(pool, prices, underlyingTokens) {
  const cellarAddress = pool.pool.split('-')[0];
  const cellarChain = pool.pool.split('-')[1];

  const asset = await v2.getHoldingPosition(cellarAddress, cellarChain);
  const assetPrice = prices.pricesByAddress[asset.toLowerCase()];

  const apyBase = await v2.getApy(cellarAddress, cellarChain);
  const apyBase7d = await v2.getApy7d(cellarAddress, cellarChain);

  // getTvlUsd implementation hasn't changed since v1.5 (v0.8.16)
  const tvlUsd = await v0816.getTvlUsd(cellarAddress, asset, cellarChain);

  const baseResult = {
    ...pool,
    tvlUsd,
    apyBase,
    apyBase7d,
    underlyingTokens,
  };

  // return pool without apyReward if stakingPool is not configured
  const stakingPool = stakingPools[cellarChain][cellarAddress];
  if (stakingPool == null) {
    return baseResult;
  }

  const apyReward = await getRewardApy(
    stakingPools[cellarChain][cellarAddress],
    prices.pricesBySymbol.somm,
    assetPrice,
    cellarChain
  );

  return {
    ...baseResult,
    apyReward,
    poolMeta:
      apyReward > 0 ? `${pool.poolMeta} - 3day Bonding Lock` : pool.poolMeta,
  };
}

// Calculates Staking APY for v0815 staking contract currently used by all pools
async function getRewardApy(stakingPool, sommPrice, assetPrice, cellarChain) {
  const rewardRateResult = (
    await call({
      target: stakingPool,
      abi: stakingAbi.rewardRate,
      chain: cellarChain,
    })
  ).output;
  const rewardRate = new BigNumber(rewardRateResult).div(1e6);

  const totalDepositWithBoostResult = (
    await call({
      target: stakingPool,
      abi: stakingAbi.totalDepositsWithBoost,
      chain: cellarChain,
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
      chain: cellarChain,
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
