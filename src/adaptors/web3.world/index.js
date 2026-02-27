const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const VENOM_COINGECKO = {
  // WVENOM (used in venomstake too)
  '0:77d36848bb159fa485628bc38dc37eadb74befa514395e09910f601b841f749e': 'coingecko:venom',
  // Bridged stablecoins/majors (addresses from API)
  '0:8a4ed4483500caf2d4bb4b56c84df41009cc3d0ed6a9de05d853e26a30faeced': 'coingecko:tether',
  '0:cda5e8d5953e1a09ffeb9f62316f2994019f10abe83c8f1b0aadfbc997bd79e6': 'coingecko:usd-coin',
  '0:60b3ebf994515df7985cb62a9d141467edf2f869272baf507dc83d9ba2e1b199': 'coingecko:ethereum',
  '0:4ff3c0f078889cbda817a5f5f2651824dea11a84f3857df27e76fee37d541877': 'coingecko:wrapped-bitcoin',
  '0:74604c7a56419477d67329848d754d205f31870025a7135909e90e1726ad9a54': 'coingecko:stakevenom',
  '0:0447c738d8549c5ea92f1c945628367db4adcc706685f760c93f8b236bf8e7e4': 'coingecko:dai',
  '0:0a75b9ad65982b02493491b00454b34dcecb9e63700d560fc001473659297661': 'coingecko:wbnb',
  '0:1c5ebbde66ef5c2e7bcd49fd3d37762204d225762b03b37cac9c9fd0a5e70f0b': 'coingecko:dragonz'
};
const resolveVenomToken = (addr) => VENOM_COINGECKO[addr] || addr;


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
      underlyingTokens: pool.meta.currencyAddresses.map(resolveVenomToken),
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
      rewardTokens: pool.rewardTokens.map(({ tokenRoot }) => resolveVenomToken(tokenRoot)),
      underlyingTokens: pool.poolTokens.map(({ tokenRoot }) => resolveVenomToken(tokenRoot)),
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
