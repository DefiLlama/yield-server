const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const ethers = require('ethers');
const abi = require('./abi');

const CONFIG = {
  ETHEREUM: {
    USD0PP: '0x35D8949372D46B7a3D5A56006AE77B215fc69bC0',
    USD0: '0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5',
    CHAIN: 'Ethereum',
  },
  ARBITRUM: {
    USD0PP: '0x2B65F9d2e4B84a2dF6ff0525741b75d1276a9C2F',
    USD0: '0x35f1C5cB7Fb977E669fD244C567Da99d8a3a6850',
    CHAIN: 'Arbitrum',
  },
  USUAL_TOKEN: '0xC4441c2BE5d8fA8126822B9929CA0b81Ea0DE38E',
  USUALX_TOKEN: '0x06B964d96f5dCF7Eae9d7C559B09EDCe244d4B8E',
  SYMBOL: 'USD0++',
  URLS: {
    REWARD_RATE: 'https://app.usual.money/api/rewards/rates/',
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
  tvlUsd,
  apyReward,
  underlyingToken
) {
  return {
    pool: poolAddress,
    chain,
    project: 'usual',
    symbol: CONFIG.SYMBOL,
    tvlUsd,
    apyReward,
    rewardTokens: [CONFIG.USUAL_TOKEN],
    underlyingTokens: [underlyingToken],
  };
}

async function getChainData(chainConfig) {
  const supply = await getTokenSupply(chainConfig.CHAIN, chainConfig.USD0PP);
  const price = await getTokenPrice(chainConfig.CHAIN, chainConfig.USD0PP);
  return { supply, price };
}

async function getUsualXAPY(chain, usualXPrice) {
  const { output } = await sdk.api.abi.call({
    target: CONFIG.USUALX_TOKEN,
    chain: chain.toLowerCase(),
    abi: abi.find((abi) => abi.name === 'totalAssets'),
  });
  const totalAssets = output / CONFIG.SCALAR;
  const rate =
    (
      await sdk.api.abi.call({
        target: CONFIG.USUALX_TOKEN,
        chain: chain.toLowerCase(),
        abi: abi.find((abi) => abi.name === 'getYieldRate'),
      })
    ).output / CONFIG.SCALAR;

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
  const usualXTVL =
    rawUsualXTVL - (blacklistedBalances?.reduce((a, b) => a + b, 0) ?? 0);

  const usualXApr = (rate * CONFIG.DAYS_PER_YEAR) / totalAssets;

  // Applying weekly compounding only to USUALx apyReward
  const usualxApyReward = utils.aprToApy(usualXApr * 100, CONFIG.WEEKS_PER_YEAR);  // Weekly compounding for apyReward

  const usualxMarketCap = usualXTVL * usualXPrice;

  const revenueSwitchApr =
    (CONFIG.DAO_PROJECTED_WEEKLY_REVENUE * CONFIG.WEEKS_PER_YEAR) /
    usualxMarketCap;
  const usualxApyRevenueSwitch = utils.aprToApy(
    revenueSwitchApr * 100,
    CONFIG.WEEKS_PER_YEAR
  );

  return {
    usualxApyReward,
    usualxApyRevenueSwitch,
    rawUsualXTVL,
  };
}

const apy = async () => {
  const { data: rewardData } = await axios.get(
    `${CONFIG.URLS.REWARD_RATE}${CONFIG.SYMBOL}`
  );
  const reward = rewardData.rewards.find(
    (e) => CONFIG.USUAL_TOKEN.toLowerCase() === e.rewardToken.toLowerCase()
  );

  // No weekly compounding for USD0++
  const apyReward = reward.apr * 100;  // Direct APR-to-APY conversion without weekly compounding

  const ethData = await getChainData(CONFIG.ETHEREUM);
  const arbData = await getChainData(CONFIG.ARBITRUM);

  const usualbalance = await getTokenBalance(
    'Ethereum',
    CONFIG.USUAL_TOKEN,
    CONFIG.USUALX_TOKEN
  );
  const usualxPrice = await getTokenPrice('Ethereum', CONFIG.USUALX_TOKEN);
  const { usualxApyReward, usualxApyRevenueSwitch, rawUsualXTVL } =
    await getUsualXAPY('Ethereum', usualxPrice);

  return [
    createPoolData(
      CONFIG.ETHEREUM.CHAIN,
      CONFIG.ETHEREUM.USD0PP,
      ethData.supply * ethData.price,
      apyReward,  // Corrected to USD0++ APY
      CONFIG.ETHEREUM.USD0
    ),
    createPoolData(
      CONFIG.ARBITRUM.CHAIN,
      CONFIG.ARBITRUM.USD0PP,
      arbData.supply * arbData.price,
      apyReward,  // Corrected for Arbitrum USD0++
      CONFIG.ARBITRUM.USD0
    ),
    {
      pool: CONFIG.USUALX_TOKEN,
      chain: 'Ethereum',
      project: 'usual',
      symbol: 'USUALx',
      tvlUsd: rawUsualXTVL * usualxPrice,
      apyBase: usualxApyReward,  // Weekly compounding for USUALx APY
      apyReward: usualxApyRevenueSwitch,
      rewardTokens: [CONFIG.ETHEREUM.USD0],
      underlyingTokens: [CONFIG.USUAL_TOKEN],
      url: 'https://app.usual.money/swap?action=stake&from=USUAL&to=USUALx',
    },
  ];
};

module.exports = {
  apy,
  url: 'https://app.usual.money/swap?action=stake',
};
