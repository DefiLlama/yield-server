const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');


const getPoolStats = async () => {
  return await utils.getData(
    "https://api.web3.world/v2/pools",
    {
      limit: 1000,
      offset: 0,
      ordering: "tvldescending",
      whiteListUri: "https://static.web3.world/assets/manifest.json",
    }
  );
};

const getFarmingPoolStats = async () => {
  return await utils.getData(
    "https://farming.web3.world/v2/gauges",
    {
      additionalTokenRoots: [],
      limit: 1000,
      offset: 0,
      showLowBalance: false,
      whitelistUri: "https://static.web3.world/assets/manifest.json"
    }
  );
};

const calcApy = (fee7d, tvl) => {
  const apy = BigNumber(fee7d).div(7).times(365).div(tvl).div(365).plus(1).pow(365).minus(1);
  if (apy.isNaN() || !apy.isFinite()) return 0
  return apy.times(100).toNumber()
}

const fetch = async () => {
  const poolsStats = await getPoolStats();
  const farmingPoolsStats = await getFarmingPoolStats();
  const result = []
  poolsStats.pools.forEach((pool) => {
    result.push({
      pool: pool.meta.poolAddress,
      chain: utils.formatChain('venom'),
      project: 'web3.world',
      symbol: pool.meta.currencies.join('-'),
      tvlUsd: Number(pool.tvl),
      underlyingTokens: pool.meta.currencyAddresses,
      apyBase: calcApy(pool.fee7d, pool.tvl),
      url: "https://web3.world/pools/" + pool.meta.poolAddress
    })
  })
  farmingPoolsStats.gauges.forEach((pool) => {
    result.push({
      pool: pool.address,
      chain: utils.formatChain('venom'),
      project: 'web3.world',
      symbol: pool.poolTokens.map(({ tokenSymbol }) => tokenSymbol).join('-'),
      tvlUsd: Number(pool.tvl),
      rewardTokens: pool.rewardTokens.map(({ tokenRoot }) => tokenRoot),
      underlyingTokens: pool.poolTokens.map(({ tokenRoot }) => tokenRoot),
      apyBase: Number(pool.minApr),
      url: "https://web3.world/farming/" + pool.address
    })
  })

  return result;
};

module.exports = {
  timetravel: false,
  apy: fetch,
  url: 'https://web3.world',
};
