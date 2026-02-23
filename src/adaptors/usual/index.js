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
    SEUR0: '0x35f43C6604B0DE814ABAa2D94C878BD1F5165478',
    ETH0: '0x734eec7930bc84eC5732022B9EB949A81fB89AbE',
    EUR0: '0x3c89Cd1884E7beF73ca3ef08d2eF6EC338fD8E49',
    EUROC: '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c',
    STETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    USD0a: '0x2e7fC02bE94BC7f0cD69DcAB572F64bcC173cd81',
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
  SEUR0_SYMBOL: 'sEUR0',
  EUR0_SYMBOL: 'EUR0',
  USUAL_SYMBOL: 'USUAL',
  USUALX_SYMBOL: 'USUALx',
  USD0PP_SYMBOL: 'bUSD0',
  ETH0_SYMBOL: 'ETH0',
  URLS: {
    REWARD_APR_RATE: 'https://app.usual.money/api/tokens/yields',
    LLAMA_PRICE: 'https://coins.llama.fi/prices/current/',
  },
  SCALAR: 1e18,
  DAYS_PER_YEAR: 365,
  DAO_PROJECTED_WEEKLY_REVENUE: 500000,
  WEEKS_PER_YEAR: 52,
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
    project: 'usual',
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
  const supply = await getTokenSupply(chainConfig.CHAIN, chainConfig.SUSD0);
  const price = await getTokenPrice(chainConfig.CHAIN, chainConfig.USD0);
  return { supply, price };
}

async function getChainDataSEUR0(chainConfig) {
  const supply = await getTokenSupply(chainConfig.CHAIN, chainConfig.SEUR0);
  const price = await getTokenPrice(chainConfig.CHAIN, chainConfig.EUROC);
  return { supply, price };
}

async function getETH0ChainData(chainConfig) {
  const supply = await getTokenSupply(chainConfig.CHAIN, chainConfig.ETH0);
  const price = await getTokenPrice(chainConfig.CHAIN, chainConfig.STETH);
  return { supply, price };
}

async function getChainDataUSD0a(chainConfig) {
  const supply = await getTokenSupply(chainConfig.CHAIN, chainConfig.USD0a);
  const price = await getTokenPrice(chainConfig.CHAIN, chainConfig.USD0);
  return { supply, price };
}

async function getUsualXAPY(chain, usualXPrice) {
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

  const usualXApr = await getRewardData(
    CONFIG.USUALX_SYMBOL,
    CONFIG.USUAL_SYMBOL
  );

  // Applying daily compounding only to USUALx apyReward
  const usualxApyReward = utils.aprToApy(usualXApr.apr, CONFIG.DAYS_PER_YEAR); // Daily compounding for apyReward

  const usualxMarketCap = usualXTVL * usualXPrice;
  const usualXLockupMarketCap = usualXLockupBalance * usualXPrice;
  const usualXUnlockedMarketCap = usualxMarketCap - usualXLockupMarketCap;

  const revenueSwitch = await getRewardData(
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

async function getUsUSDSAPY(chain) {
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

  const baseRewards = await getRewardData(
    CONFIG.USUSDSPP_VAULT_SYMBOL,
    CONFIG.USD0PP_SYMBOL
  );
  const baseUsUSDSApy = utils.aprToApy(baseRewards.apr, CONFIG.WEEKS_PER_YEAR);
  const usualRewards = await getRewardData(
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

async function getRewardData(pool, reward) {
  const { data } = await axios.get(`${CONFIG.URLS.REWARD_APR_RATE}`);
  const apr = data[pool]?.[reward];

  if (!apr) {
    throw new Error(`Reward "${reward}" not found for pool "${pool}"`);
  }

  return {
    apr,
  };
}

const apy = async () => {
  const rewardUsd0pp = await getRewardData(
    CONFIG.USD0PP_SYMBOL,
    CONFIG.USUAL_SYMBOL
  );

  const apyReward = utils.aprToApy(rewardUsd0pp.apr, CONFIG.WEEKS_PER_YEAR);
  const ethData = await getChainDataBUSD0(CONFIG.ETHEREUM);
  const arbData = await getChainDataBUSD0(CONFIG.ARBITRUM);

  // ETH0 APY
  const rewardEth0 = await getRewardData(
    CONFIG.ETH0_SYMBOL,
    CONFIG.USUAL_SYMBOL
  );
  const apyRewardEth0 = utils.aprToApy(rewardEth0.apr, CONFIG.WEEKS_PER_YEAR);
  const eth0Data = await getETH0ChainData(CONFIG.ETHEREUM);

  // sUSD0 APY
  const rewardSUsd0 = await getRewardData(
    CONFIG.SUSD0_SYMBOL,
    CONFIG.USD0_SYMBOL
  );
  const apyRewardSUsd0 = utils.aprToApy(rewardSUsd0.apr, CONFIG.WEEKS_PER_YEAR);
  const susd0Data = await getChainDataSUSD0(CONFIG.ETHEREUM);

  // sEUR0 APY
  const rewardSEUR0 = await getRewardData(
    CONFIG.SEUR0_SYMBOL,
    CONFIG.EUR0_SYMBOL
  );
  const apyRewardSEUR0 = utils.aprToApy(rewardSEUR0.apr, CONFIG.WEEKS_PER_YEAR);
  const seur0Data = await getChainDataSEUR0(CONFIG.ETHEREUM);

  // USD0a APY
  const rewardUSD0a = await getRewardData(
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
  } = await getUsualXAPY('Ethereum', usualxPrice);
  const { baseUsUSDSApy, usUSDSRewardApy, usUSDSppMarketCap } =
    await getUsUSDSAPY('Ethereum');
  return [
    createPoolData(
      CONFIG.ETHEREUM.CHAIN,
      CONFIG.ETHEREUM.USD0a,
      CONFIG.USD0A_SYMBOL,
      usd0aData.supply * usd0aData.price,
      apyRewardUSD0a,
      CONFIG.ETHEREUM.USD0,
      CONFIG.ETHEREUM.USD0
    ),
    createPoolData(
      CONFIG.ETHEREUM.CHAIN,
      CONFIG.ETHEREUM.SEUR0,
      CONFIG.SEUR0_SYMBOL,
      seur0Data.supply * seur0Data.price,
      apyRewardSEUR0,
      CONFIG.ETHEREUM.EUR0,
      CONFIG.ETHEREUM.EUR0
    ),
    createPoolData(
      CONFIG.ETHEREUM.CHAIN,
      CONFIG.ETHEREUM.SUSD0,
      CONFIG.SUSD0_SYMBOL,
      susd0Data.supply * susd0Data.price,
      apyRewardSUsd0,
      CONFIG.ETHEREUM.USD0,
      CONFIG.ETHEREUM.USD0
    ),
    createPoolData(
      CONFIG.ETHEREUM.CHAIN,
      CONFIG.ETHEREUM.ETH0,
      CONFIG.ETH0_SYMBOL,
      eth0Data.supply * eth0Data.price,
      apyRewardEth0,
      CONFIG.USUAL_TOKEN,
      CONFIG.ETHEREUM.STETH
    ),
    createPoolData(
      CONFIG.ETHEREUM.CHAIN,
      CONFIG.ETHEREUM.USD0PP,
      CONFIG.USD0PP_SYMBOL,
      ethData.supply * ethData.price,
      apyReward, // Corrected to USD0++ APY
      CONFIG.USUAL_TOKEN,
      CONFIG.ETHEREUM.USD0
    ),
    createPoolData(
      CONFIG.ARBITRUM.CHAIN,
      CONFIG.ARBITRUM.USD0PP,
      CONFIG.USD0PP_SYMBOL,
      arbData.supply * arbData.price,
      apyReward, // Corrected for Arbitrum USD0++
      CONFIG.USUAL_TOKEN,
      CONFIG.ARBITRUM.USD0
    ),
    {
      pool: CONFIG.USUALX_TOKEN,
      chain: 'Ethereum',
      project: 'usual',
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
      project: 'usual',
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
      project: 'usual',
      symbol: 'usUSDS++',
      tvlUsd: usUSDSppMarketCap,
      apyBase: baseUsUSDSApy, // Weekly compounding for USUSDS++ APY in USD0++
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
