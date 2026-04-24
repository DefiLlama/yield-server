const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const ethers = require('ethers');
const abi = require('./abi');

const CONFIG = {
  ETHEREUM: {
    USD0PP: '0x35D8949372D46B7a3D5A56006AE77B215fc69bC0',
    USD0: '0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5',
    SUSD0: '0xd861bE82dEe3223CFBEd160791f6550b0704D406',
    USD0A: '0x2e7fC02bE94BC7f0cD69DcAB572F64bcC173cd81',
    CHAIN: 'Ethereum',
  },
  ARBITRUM: {
    USD0PP: '0x2B65F9d2e4B84a2dF6ff0525741b75d1276a9C2F',
    USD0: '0x35f1C5cB7Fb977E669fD244C567Da99d8a3a6850',
    CHAIN: 'Arbitrum',
  },
  USUSDSPP_VAULT: '0x67ec31a47a4126A66C7bb2fE017308cf5832A4Db',
  USUSDSPP_VAULT_SYMBOL: 'usUSDS++',
  USUAL_TOKEN: '0xC4441c2BE5d8fA8126822B9929CA0b81Ea0DE38E',
  SUSDS_TOKEN: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD',
  USUALX_TOKEN: '0x06B964d96f5dCF7Eae9d7C559B09EDCe244d4B8E',
  USUALX_LOCKUP: '0x85B6F9BDdb10c6B320d07416a250F984f0F0E9ED',
  USUALX_LOCKUP_SYMBOL: 'lUSUALx (12 months)',
  USD0_SYMBOL: 'USD0',
  USD0A_SYMBOL: 'USD0a',
  SUSD0_SYMBOL: 'sUSD0',
  USUAL_SYMBOL: 'USUAL',
  USUALX_SYMBOL: 'USUALx',
  USD0PP_SYMBOL: 'bUSD0',
  URLS: {
    REWARD_APR_RATE: 'https://app.usual.money/api/tokens/yields',
    LLAMA_PRICE: 'https://coins.llama.fi/prices/current/',
  },
  SCALAR: 1e18,
  DAYS_PER_YEAR: 365,
  WEEKS_PER_YEAR: 52,
  DAO_PROJECTED_WEEKLY_REVENUE: 500000,
  USUALX_BALANCES_BLACKLIST: [
    '0x86E2a16A5aBC67467Ce502e3Dab511c909C185A8', // Pendle SY
    '0xF9F7ee120E4Ce2b4500611952Df8C7470Af09816', // Uniswap USUALx/USUAL
    '0x36dee1e8B4679c67d73C8361E943C3401aD77FE3', // Uniswap USUALx/USD0
    '0xDe4b4eaF83b678017E1b3C455117E752fE4e70eA', // Uniswap USUALx/USDT
    '0x06B964d96f5dCF7Eae9d7C559B09EDCe244d4B8E', // USUALx dead shares
  ],
};

async function getTokenSupply(chain, address) {
  const params = {
    chain: chain.toLowerCase(),
    target: address,
    abi: 'erc20:totalSupply',
  };
  const { output } = await sdk.api.abi.call(params);
  return output / CONFIG.SCALAR;
}

async function getTotalAssets(chain, address) {
  const { output } = await sdk.api.abi.call({
    chain: chain.toLowerCase(),
    target: address,
    abi: abi.find((a) => a.name === 'totalAssets'),
  });
  return output / CONFIG.SCALAR;
}

async function getTokenBalance(chain, address, user) {
  const params = {
    target: address,
    chain: chain.toLowerCase(),
    abi: 'erc20:balanceOf',
    params: [user],
  };

  const { output } = await sdk.api.abi.call(params);
  return output / CONFIG.SCALAR;
}

async function getTokenPrice(chain, address) {
  const priceKey = `${chain.toLowerCase()}:${address}`;
  const { data } = await axios.get(`${CONFIG.URLS.LLAMA_PRICE}${priceKey}`);
  return data.coins[priceKey].price;
}

function createPoolData(
  chain,
  poolAddress,
  symbol,
  tvlUsd,
  apyReward,
  rewardToken,
  underlyingToken
) {
  return {
    pool: poolAddress,
    chain,
    project: 'usual-usd0',
    symbol,
    tvlUsd,
    apyReward,
    rewardTokens: [rewardToken],
    underlyingTokens: [underlyingToken],
  };
}

async function getChainDataBUSD0(chainConfig) {
  const supply = await getTokenSupply(chainConfig.CHAIN, chainConfig.USD0PP);
  const price = await getTokenPrice(chainConfig.CHAIN, chainConfig.USD0PP);
  return { supply, price };
}

async function getChainDataSUSD0(chainConfig) {
  const supply = await getTotalAssets(chainConfig.CHAIN, chainConfig.SUSD0);
  const price = await getTokenPrice(chainConfig.CHAIN, chainConfig.USD0);
  return { supply, price };
}

async function getChainDataUSD0a(chainConfig) {
  const supply = await getTokenSupply(chainConfig.CHAIN, chainConfig.USD0A);
  const price = await getTokenPrice(chainConfig.CHAIN, chainConfig.USD0);
  return { supply, price };
}

async function getUsualXAPY(chain, usualXPrice, rewardsData) {
  const blacklistedBalances = await sdk.api.abi
    .multiCall({
      abi: 'erc20:balanceOf',
      calls: CONFIG.USUALX_BALANCES_BLACKLIST.map((address) => ({
        target: CONFIG.USUALX_TOKEN,
        params: [address],
      })),
      chain: chain.toLowerCase(),
      permitFailure: true,
    })
    .then((call) =>
      call.output.map((e) => {
        return e.output / CONFIG.SCALAR;
      })
    );

  const rawUsualXTVL = await getTokenSupply(chain, CONFIG.USUALX_TOKEN);
  const usualXLockupBalance = await getTokenBalance(
    'Ethereum',
    CONFIG.USUALX_TOKEN,
    CONFIG.USUALX_LOCKUP
  );
  const UsualXUnlockedTVL = rawUsualXTVL - usualXLockupBalance;
  const usualXTVL =
    rawUsualXTVL - (blacklistedBalances?.reduce((a, b) => a + b, 0) ?? 0);

  const usualXApr = getRewardData(
    rewardsData,
    CONFIG.USUALX_SYMBOL,
    CONFIG.USUAL_SYMBOL
  );

  // Applying daily compounding only to USUALx apyReward
  const usualxApyReward = utils.aprToApy(usualXApr.apr, CONFIG.DAYS_PER_YEAR); // Daily compounding for apyReward

  const usualxMarketCap = usualXTVL * usualXPrice;
  const usualXLockupMarketCap = usualXLockupBalance * usualXPrice;
  const usualXUnlockedMarketCap = usualxMarketCap - usualXLockupMarketCap;

  const revenueSwitch = getRewardData(
    rewardsData,
    CONFIG.USUALX_LOCKUP_SYMBOL,
    CONFIG.USD0_SYMBOL
  );
  const usualxApyRevenueSwitch = utils.aprToApy(
    revenueSwitch.apr,
    CONFIG.WEEKS_PER_YEAR
  );

  return {
    usualxApyReward,
    usualxApyRevenueSwitch,
    rawUsualXTVL,
    usualXLockupMarketCap,
    usualXUnlockedMarketCap,
  };
}

async function getUsUSDSAPY(chain, rewardsData) {
  const { output } = await sdk.api.abi.call({
    target: CONFIG.USUSDSPP_VAULT,
    chain: chain.toLowerCase(),
    abi: abi.find((abi) => abi.name === 'totalAssets'),
  });
  const totalAssets = output / CONFIG.SCALAR;

  const blacklistedBalances = await sdk.api.abi
    .multiCall({
      abi: 'erc20:balanceOf',
      calls: CONFIG.USUALX_BALANCES_BLACKLIST.map((address) => ({
        target: CONFIG.USUSDSPP_VAULT,
        params: [address],
      })),
      chain: chain.toLowerCase(),
      permitFailure: true,
    })
    .then((call) =>
      call.output.map((e) => {
        return e.output / CONFIG.SCALAR;
      })
    );

  const rawUsUSDSppTVL = await getTokenSupply(chain, CONFIG.USUSDSPP_VAULT);

  const usualXTVL =
    rawUsUSDSppTVL - (blacklistedBalances?.reduce((a, b) => a + b, 0) ?? 0);

  //sUSDS++ vault data
  const susdsBalance = await getTokenBalance(
    'Ethereum',
    CONFIG.SUSDS_TOKEN,
    CONFIG.USUSDSPP_VAULT
  );
  const susdsPrice = await getTokenPrice('Ethereum', CONFIG.SUSDS_TOKEN);
  const usUSDSppMarketCap = susdsBalance * susdsPrice;

  const baseRewards = getRewardData(
    rewardsData,
    CONFIG.USUSDSPP_VAULT_SYMBOL,
    CONFIG.USD0PP_SYMBOL
  );
  const baseUsUSDSApy = utils.aprToApy(baseRewards.apr, CONFIG.WEEKS_PER_YEAR);
  const usualRewards = getRewardData(
    rewardsData,
    CONFIG.USUSDSPP_VAULT_SYMBOL,
    CONFIG.USUAL_SYMBOL
  );
  const usUSDSRewardApy = utils.aprToApy(
    usualRewards.apr,
    CONFIG.DAYS_PER_YEAR
  );
  return {
    baseUsUSDSApy,
    usUSDSRewardApy,
    usUSDSppMarketCap,
  };
}

// Pools we depend on — used as a schema-integrity check so a broken upstream
// returning partial data fails loudly at fetch time rather than surfacing
// confusing per-pool errors later.
const REQUIRED_REWARD_KEYS = [
  'USD0PP_SYMBOL',
  'SUSD0_SYMBOL',
  'USD0A_SYMBOL',
  'USUALX_SYMBOL',
  'USUALX_LOCKUP_SYMBOL',
  'USUSDSPP_VAULT_SYMBOL',
];

// Fetched once per apy() invocation and threaded through as a parameter. The
// upstream returns 502s intermittently — one fetch + retries is the robust
// shape, and the explicit parameter makes the lifecycle visible at every
// call site (no hidden module state). No Last-Modified / payload timestamp
// is exposed by the upstream, so we proxy staleness via schema checks here.
async function fetchRewardsData() {
  const { data } = await utils.withRetry(() =>
    axios.get(CONFIG.URLS.REWARD_APR_RATE)
  );

  if (
    data == null ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    data.error
  ) {
    const preview = JSON.stringify(data).slice(0, 200);
    throw new Error(
      `usual-usd0: unexpected rewards payload shape (${preview})`
    );
  }

  const missing = REQUIRED_REWARD_KEYS.filter((k) => !data[CONFIG[k]]);
  if (missing.length) {
    throw new Error(
      `usual-usd0: rewards payload missing expected pools: ${missing
        .map((k) => CONFIG[k])
        .join(', ')}`
    );
  }

  return data;
}

function getRewardData(rewardsData, pool, reward) {
  const apr = rewardsData[pool]?.[reward];

  // `== null` catches missing keys (null/undefined) without false-positively
  // firing on a legitimate `0` (numeric) or `"0"` (string) APR.
  if (apr == null) {
    throw new Error(`Reward "${reward}" not found for pool "${pool}"`);
  }

  return { apr };
}

const apy = async () => {
  const rewardsData = await fetchRewardsData();
  const rewardUsd0pp = getRewardData(
    rewardsData,
    CONFIG.USD0PP_SYMBOL,
    CONFIG.USUAL_SYMBOL
  );

  const apyReward = utils.aprToApy(rewardUsd0pp.apr, CONFIG.WEEKS_PER_YEAR);
  const ethData = await getChainDataBUSD0(CONFIG.ETHEREUM);
  const arbData = await getChainDataBUSD0(CONFIG.ARBITRUM);

  // sUSD0 APY
  const rewardSUsd0 = getRewardData(
    rewardsData,
    CONFIG.SUSD0_SYMBOL,
    CONFIG.USD0_SYMBOL
  );
  const apyRewardSUsd0 = utils.aprToApy(rewardSUsd0.apr, CONFIG.WEEKS_PER_YEAR);
  const susd0Data = await getChainDataSUSD0(CONFIG.ETHEREUM);

  // USD0a APY
  const rewardUSD0a = getRewardData(
    rewardsData,
    CONFIG.USD0A_SYMBOL,
    CONFIG.USD0A_SYMBOL
  );
  const apyRewardUSD0a = utils.aprToApy(rewardUSD0a.apr, CONFIG.WEEKS_PER_YEAR);
  const usd0aData = await getChainDataUSD0a(CONFIG.ETHEREUM);

  const usualbalance = await getTokenBalance(
    'Ethereum',
    CONFIG.USUAL_TOKEN,
    CONFIG.USUALX_TOKEN
  );
  const usualxPrice = await getTokenPrice('Ethereum', CONFIG.USUALX_TOKEN);
  const {
    usualxApyReward,
    usualxApyRevenueSwitch,
    rawUsualXTVL,
    usualXLockupMarketCap,
    usualXUnlockedMarketCap,
  } = await getUsualXAPY('Ethereum', usualxPrice, rewardsData);
  const { baseUsUSDSApy, usUSDSRewardApy, usUSDSppMarketCap } =
    await getUsUSDSAPY('Ethereum', rewardsData);
  return [
    {
      pool: CONFIG.ETHEREUM.USD0A,
      chain: 'Ethereum',
      project: 'usual-usd0',
      symbol: CONFIG.USD0A_SYMBOL,
      tvlUsd: usd0aData.supply * usd0aData.price,
      apyBase: apyRewardUSD0a, // weekly compounding for USD0a APY
      apyReward: 0, // No additional reward for USD0a
      rewardTokens: [CONFIG.ETHEREUM.USD0],
      poolMeta: 'USD0 Alpha',
      underlyingTokens: [CONFIG.ETHEREUM.USD0],
      url: 'https://app.usual.money/swap?action=stake&from=USD0&to=USD0a',
    },
    {
      pool: CONFIG.ETHEREUM.SUSD0,
      chain: 'Ethereum',
      project: 'usual-usd0',
      symbol: CONFIG.SUSD0_SYMBOL,
      tvlUsd: susd0Data.supply * susd0Data.price,
      apyBase: apyRewardSUsd0, // weekly compounding for sUSD0 APY
      apyReward: 0, // No additional reward for sUSD0
      rewardTokens: [CONFIG.ETHEREUM.USD0],
      poolMeta: 'USD0 Savings',
      underlyingTokens: [CONFIG.ETHEREUM.USD0],
      url: 'https://app.usual.money/swap?action=stake&from=USD0&to=sUSD0',
    },
    createPoolData(
      CONFIG.ETHEREUM.CHAIN,
      CONFIG.ETHEREUM.USD0PP,
      CONFIG.USD0PP_SYMBOL,
      ethData.supply * ethData.price,
      apyReward, // Corrected to bUSD0 APY
      CONFIG.USUAL_TOKEN,
      CONFIG.ETHEREUM.USD0
    ),
    createPoolData(
      CONFIG.ARBITRUM.CHAIN,
      CONFIG.ARBITRUM.USD0PP,
      CONFIG.USD0PP_SYMBOL,
      arbData.supply * arbData.price,
      apyReward, // Corrected for Arbitrum bUSD0
      CONFIG.USUAL_TOKEN,
      CONFIG.ARBITRUM.USD0
    ),
    {
      pool: CONFIG.USUALX_TOKEN,
      chain: 'Ethereum',
      project: 'usual-usd0',
      symbol: 'USUALx',
      tvlUsd: usualXUnlockedMarketCap,
      apyBase: usualxApyReward, // Daily compounding for USUALx APY
      apyReward: 0, // No additional reward for USUALx
      rewardTokens: [CONFIG.ETHEREUM.USD0],
      poolMeta: 'Staked USUAL',
      underlyingTokens: [CONFIG.USUAL_TOKEN],
      url: 'https://app.usual.money/swap?action=stake&from=USUAL&to=USUALx',
    },
    {
      pool: CONFIG.USUALX_LOCKUP,
      chain: 'Ethereum',
      project: 'usual-usd0',
      symbol: 'USUALx',
      tvlUsd: usualXLockupMarketCap,
      apyBase: usualxApyReward, // Daily compounding for USUALx APY
      apyReward: usualxApyRevenueSwitch, // Revenue switch APY for Lockup USUALx Weekly compounding
      rewardTokens: [CONFIG.ETHEREUM.USD0],
      underlyingTokens: [CONFIG.USUAL_TOKEN],
      poolMeta: 'Lockup',
      url: 'https://app.usual.money/swap?from=USUALx&to=lUSUALx',
    },
    {
      pool: CONFIG.USUSDSPP_VAULT,
      chain: 'Ethereum',
      project: 'usual-usd0',
      symbol: 'usUSDS++',
      tvlUsd: usUSDSppMarketCap,
      apyBase: baseUsUSDSApy, // Weekly compounding for USUSDS++ APY in bUSD0
      apyReward: usUSDSRewardApy, // Reward in Usual APY for USUSDS++
      rewardTokens: [CONFIG.USUAL_TOKEN],
      underlyingTokens: [CONFIG.ETHEREUM.USD0PP],
      poolMeta: 'usUSDS++ vault',
      url: 'https://app.usual.money/vault/susds',
    },
  ];
};

module.exports = {
  apy,
  url: 'https://app.usual.money/swap?action=stake',
};
