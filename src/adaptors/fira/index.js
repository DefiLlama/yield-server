const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const ethers = require('ethers');
const abiBUSD0 = require('./abiBUSD0');
const abiLendingMarket = require('./abiLendingMarket');

const API_ALIASES = {
  'USD0++': 'bUSD0',
};

const CONFIG = {
  ETHEREUM: {
    USD0PP: '0x35D8949372D46B7a3D5A56006AE77B215fc69bC0',
    USD0: '0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5',
    CHAIN: 'Ethereum',
  },
  URLS: {
    LLAMA_PRICE: 'https://coins.llama.fi/prices/current/',
  },
  UZRLendingMarket: '0xa428723eE8ffD87088C36121d72100B43F11fb6A',
  UZRLendingMarketId:
    '0xA597B5A36F6CC0EDE718BA58B2E23F5C747DA810BF8E299022D88123AB03340E',

  bUSD0_SYMBOL: 'bUSD0',
  UZR_SYMBOL: 'UZR',
  SECONDS_PER_YEAR: 31536000,
  LTV: 0.88,
};

async function getTokenBalance(chain, address, user) {
  const params = {
    target: address,
    chain: chain.toLowerCase(),
    abi: 'erc20:balanceOf',
    params: [user],
  };

  const { output } = await sdk.api.abi.call(params);
  return output / 1e18; // Assuming 18 decimals for token balance
}

async function getSecondsToMaturity(chainConfig) {
  const getEndTimeAbi = abiBUSD0.find((abi) => abi.name === 'getEndTime');

  const result = await sdk.api.abi.call({
    target: chainConfig.USD0PP,
    abi: getEndTimeAbi,
    chain: chainConfig.CHAIN.toLowerCase(),
  });

  const endTime = result.output;
  const now = Math.floor(Date.now() / 1000);
  return endTime - now; // Return seconds to maturity
}

async function getTokenPrice(chain, address) {
  const priceKey = `${chain.toLowerCase()}:${address}`;
  const { data } = await axios.get(`${CONFIG.URLS.LLAMA_PRICE}${priceKey}`);
  return data.coins[priceKey].price;
}

async function getROI(chainConfig) {
  const bUSD0price = await getTokenPrice(chainConfig.CHAIN, chainConfig.USD0PP);
  const USD0price = await getTokenPrice(chainConfig.CHAIN, chainConfig.USD0);
  const ROI = (USD0price / bUSD0price - 1) * 100;
  const secondsToMaturity = await getSecondsToMaturity(chainConfig);
  if (!Number.isFinite(secondsToMaturity) || secondsToMaturity <= 0) {
    return { ROI: 0, APR: 0, bUSD0price, USD0price };
  }
  const APR = (ROI * CONFIG.SECONDS_PER_YEAR) / secondsToMaturity;
  return { ROI, APR, bUSD0price, USD0price };
}

async function getAllAPYs(chainConfig) {
  const LTV = CONFIG.LTV;
  const { APR, ROI, bUSD0price, USD0price } = await getROI(chainConfig);

  const denom = 1 - LTV / bUSD0price;
  const maxLeverage = denom > 0 && Number.isFinite(denom) ? 1 / denom : 1;
  const leverageAPR = APR * maxLeverage;
  return { maxLeverage, leverageAPR, APR, ROI, bUSD0price, USD0price };
}

async function getMarketData(chainConfig) {
  const marketAbi = abiLendingMarket.find((abi) => abi.name === 'market');
  if (!marketAbi) {
    throw new Error('market ABI not found');
  }
  const marketData = await sdk.api.abi.call({
    target: CONFIG.UZRLendingMarket,
    abi: marketAbi,
    params: [CONFIG.UZRLendingMarketId],
    chain: CONFIG.ETHEREUM.CHAIN.toLowerCase(),
  });

  return marketData;
}

const apy = async () => {
  const { maxLeverage, leverageAPR, APR, ROI, bUSD0price, USD0price } =
    await getAllAPYs(CONFIG.ETHEREUM);
  // USD0PP token balance held by the lending market contract
  const lendingMarketBalance = await getTokenBalance(
    CONFIG.ETHEREUM.CHAIN,
    CONFIG.ETHEREUM.USD0PP,
    CONFIG.UZRLendingMarket
  );

  const marketData = await getMarketData(CONFIG.ETHEREUM);
  // sdk returns both array + named props for tuple outputs; normalize to named props
  const totalSupplyAssets =
    (marketData.output.totalSupplyAssets ?? marketData.output[0]) / 1e18;
  const totalBorrowAssets =
    (marketData.output.totalBorrowAssets ?? marketData.output[2]) / 1e18;
  const totalSupplyUsd = totalSupplyAssets * USD0price;
  const totalBorrowUsd = totalBorrowAssets * USD0price;
  const borrowFactor = totalBorrowUsd / totalSupplyUsd;

  const tvlUsd = totalSupplyUsd - totalBorrowUsd;

  return [
    {
      pool: `0xa428723eE8ffD87088C36121d72100B43F11fb6A`,
      chain: 'Ethereum',
      project: 'fira',
      symbol: utils.formatSymbol(CONFIG.UZR_SYMBOL),
      tvlUsd,
      apyBase: APR,
      apyBaseBorrow: 0,
      totalSupplyUsd,
      totalBorrowUsd,
      underlyingTokens: [CONFIG.ETHEREUM.USD0PP],
      rewardTokens: [],
      ltv: CONFIG.LTV,
      poolMeta: `Max leverage ~${maxLeverage.toFixed(2)}x`,
      url: `https://app.fira.money`,
    },
  ];
};

module.exports = {
  apy,
  url: 'https://app.fira.money',
};
