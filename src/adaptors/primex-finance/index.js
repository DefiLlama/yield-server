const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { abi } = require('./abi');
const { ethers } = require('ethers');
const utils = require('../utils');
const {
  CHAIN_IDS,
  DEAD_ADDRESS,
  ROLES,
  SECONDS_PER_YEAR,
  APY_REWARD_BONUS,
  config,
  addressEq,
  getPoolUrl,
} = require('./utils');

const formatPool = async (bucket, config) => {
  const {
    bucketAddress,
    asset,
    supportedAssets,
    supply,
    demand,
    bar,
    lar,
    estimatedBar,
    estimatedLar,
    miningParams,
    name,
  } = bucket;

  const { chain, EPMX, USDCE, apyRewardBySymbol } = config;

  const symbol = addressEq(asset?.tokenAddress, USDCE)
    ? 'USDC.E'
    : asset?.symbol;
  const underlyingTokens = [asset?.tokenAddress];

  const priceKeys = underlyingTokens
    .map((t) => `${chain.toLowerCase()}:${t}`)
    .join(',');

  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;

  const assetPrice = prices[`${chain.toLowerCase()}:${asset?.tokenAddress}`];
  const totalSupplyUsd =
    (supply / 10 ** assetPrice?.decimals) * assetPrice?.price;
  const totalBorrowUsd =
    (demand / 10 ** assetPrice?.decimals) * assetPrice?.price;
  const tvlUsd = totalSupplyUsd - totalBorrowUsd;

  const isMiningPhase =
    !miningParams?.isBucketLaunched &&
    miningParams?.deadlineTimestamp * 1000 > Date.now();

  const apyBaseCalculated =
    (Math.pow(1 + lar / 10 ** 27 / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) *
    100;
  const apyBase = isMiningPhase ? 0 : apyBaseCalculated;

  const apyBaseBorrowCalculated =
    (Math.pow(1 + bar / 10 ** 27 / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) *
    100;
  const apyBaseBorrow = isMiningPhase ? 0 : apyBaseBorrowCalculated;
  const apyReward = isMiningPhase ? APY_REWARD_BONUS : 0;
  const apyRewardBorrow = 0;

  return {
    pool: `${bucketAddress}-${chain}`.toLowerCase(),
    chain,
    project: 'primex-finance',
    symbol,
    tvlUsd,
    apyBase,
    apyReward,
    underlyingTokens,
    url: getPoolUrl(bucketAddress, chain),
    apyBaseBorrow,
    apyRewardBorrow,
    totalSupplyUsd,
    totalBorrowUsd,
  };
};

const getPools = async (config) => {
  const {
    chain,
    lensAddress,
    bucketsFactory,
    positionManager,
  } = config;

  if (chain === 'Ethereum') {
    sdk.api.config.setProvider(
      'ethereum',
      new ethers.providers.JsonRpcProvider(
        "https://lb.drpc.org/ogrpc?network=ethereum&dkey=AhjAIUax7EMFtu9ErxcXVpjOZcogyegR77I1IlZWwHzR"
      )
    );
  }

  if (chain === 'Base') {
    sdk.api.config.setProvider(
      'base',
      new ethers.providers.JsonRpcProvider(
        'https://lb.drpc.org/ogrpc?network=base&dkey=AhjAIUax7EMFtu9ErxcXVpjOZcogyegR77I1IlZWwHzR'
      )
    );
  }
  let bucketsArr = [];
  let offset = 0;
  const limit = 3;

  while (true) {
    try {
      const result = (
        await sdk.api.abi.call({
          abi: abi.getAllBucketsFactory,
          target: lensAddress,
          chain: chain.toLowerCase(),
          params: [
            bucketsFactory,
            DEAD_ADDRESS,
            positionManager,
            false,
            offset,
            limit,
          ],
        })
      ).output;

      if (result[0].length !== 0) {
        bucketsArr = bucketsArr.concat(result[0]);
      }

      if (result[1] === '0') {
        break;
      }

      offset += limit;
    } catch (error) {
      console.error(error);
      break;
    }
  }
  
  return await Promise.all(
    bucketsArr
      .filter((bucket) => {
        const miningParams = bucket.miningParams;
        const isMiningFailed =
          !miningParams?.isBucketLaunched &&
          miningParams?.deadlineTimestamp * 1000 <= Date.now();
        return !isMiningFailed;
      })
      .map((b) => formatPool(b, config))
  );
};

const getApy = async () => {
  const pools = (await Promise.all(config.map((c) => getPools(c)))).flat();
  return pools.filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
