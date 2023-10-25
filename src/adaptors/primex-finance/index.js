const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { abi } = require('./abi');
const { APYREWARD_BY_SYMBOL, CHAIN_IDS, DEAD_ADDRESS, ROLES, SECONDS_PER_YEAR, APY_REWARD_BONUS, config } = require('./utils')

const getPoolUrl = (address, chain) => `https://app.primex.finance/#/bucket-details/${address}?network=${CHAIN_IDS[chain]}`

const formatPool = async (bucket, config, EPMXPrice) => {
  const { bucketAddress, asset, supportedAssets, supply, demand, bar, lar, estimatedBar, estimatedLar, miningParams, name } = bucket;
  const { chain, activityRewardDistributor, EPMX } = config

  const [rewardPerTokenLender, rewardPerTokenTrader] = (await Promise.all(
    Object.values(ROLES).map((r) => {
      return (
        sdk.api.abi.call({
          abi: abi.activityRewardDistributorBuckets,
          target: activityRewardDistributor,
          chain: chain.toLowerCase(),
          params: [bucketAddress, r]
        })
        )
      })
      )).map(v => v.output.isFinished ? 0 : v.output.rewardPerToken)

  const symbol = asset.symbol
  const underlyingTokens = [asset.tokenAddress]

  const priceKeys = underlyingTokens.map((t) => `${chain.toLowerCase()}:${t}`).join(',')
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;

  const assetPrice = prices[`${chain.toLowerCase()}:${asset.tokenAddress}`]
  const totalSupplyUsd = (supply / 10 ** assetPrice.decimals) * assetPrice.price
  const totalBorrowUsd = (demand / 10 ** assetPrice.decimals) * assetPrice.price
  const tvlUsd = totalSupplyUsd - totalBorrowUsd

  const isMiningPhase = !miningParams.isBucketLaunched && miningParams.deadlineTimestamp * 1000 > Date.now()

  const apyBaseCalculated = (Math.pow(1 + (lar / 10 ** 27) / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100
  const apyBase = isMiningPhase ? 0 : apyBaseCalculated

  const apyBaseBorrowCalculated = (Math.pow(1 + (bar / 10 ** 27) / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100
  const apyBaseBorrow = isMiningPhase ? 0 : apyBaseBorrowCalculated

  const apyRewardCalculated = rewardPerTokenLender * 10 ** asset.decimals / 10 ** 18 * SECONDS_PER_YEAR * EPMXPrice / assetPrice / 10 ** 18 * 100;
  const apyReward = isMiningPhase ? APYREWARD_BY_SYMBOL[symbol] + APY_REWARD_BONUS : apyRewardCalculated

  const apyRewardBorrowCalculated = rewardPerTokenTrader * 10 ** asset.decimals / 10 ** 18 * SECONDS_PER_YEAR * EPMXPrice / assetPrice / 10 ** 18 * 100;
  const apyRewardBorrow = isMiningPhase ? 0 : apyRewardBorrowCalculated

  return {
    pool: `${bucketAddress}-${chain}`.toLowerCase(),
    chain,
    project: 'primex-finance',
    symbol,
    tvlUsd,
    apyBase,
    apyReward,
    rewardTokens: [EPMX],
    underlyingTokens,
    url: getPoolUrl(bucketAddress, chain),
    apyBaseBorrow,
    apyRewardBorrow,
    totalSupplyUsd,
    totalBorrowUsd,
  }
}

const getPools = async (config) => {
  const { chain, lensAddress, bucketsFactory, positionManager, EPMX, EPMXPriceFeed, EPMXPriceFeedDecimals } = config;

  const buckets = (
    await sdk.api.abi.call({
      abi: abi.getAllBucketsFactory,
      target: lensAddress,
      chain: chain.toLowerCase(),
      params: [bucketsFactory, DEAD_ADDRESS, positionManager, false]
    })).output

  const EPMXPrice = (await sdk.api.abi.call({
    abi: abi.getChainlinkLatestRoundData,
    target: lensAddress,
    chain: chain.toLowerCase(),
    params: [[EPMXPriceFeed]]
  })).output[0].answer / 10 ** EPMXPriceFeedDecimals

  return await Promise.all(
    buckets
      .filter(({ miningParams }) => {
        const isMiningFailed = !miningParams.isBucketLaunched && miningParams.deadlineTimestamp * 1000 <= Date.now()
        
        return !isMiningFailed
      })
      .map((b) => formatPool(b, config, EPMXPrice))
  )
}

const getApy = async () => {
  return (await Promise.all(config.map((c) => getPools(c)))).flat()
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
