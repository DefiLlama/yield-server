const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const PROJECT_NAME = 'ea-finance';
const DEPOSIT_CONTRACT = '0x23EbC3770f98c01EDAB20eb1eF17Ee633c19b467';
const WCC_ADDRESS = '0x6050D829F5a5E0eA758D8357DDcdeC1381699248';

const abis = {
  getCurrentAPY: {
    "inputs": [],
    "name": "getCurrentAPY",
    "outputs": [{ "internalType": "uint256", "name": "apy", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  getContractInfo: {
    "inputs": [],
    "name": "getContractInfo",
    "outputs": [
      { internalType: "uint256", name: "rewardPerPeriodAmount", type: "uint256" },
      { internalType: "uint256", name: "rewardPeriodSeconds", type: "uint256" },
      { internalType: "uint256", name: "totalStakedAmount", type: "uint256" },
      { internalType: "uint256", name: "totalClaimedAmount", type: "uint256" },
      { internalType: "uint256", name: "totalFeesAmount", type: "uint256" },
      { internalType: "uint256", name: "rewardStartTimestamp", type: "uint256" },
      { internalType: "uint256", name: "lastRewardUpdateTimestamp", type: "uint256" },
      { internalType: "uint256", name: "currentTime", type: "uint256" },
      { internalType: "uint256", name: "poolCapAmount", type: "uint256" },
      { internalType: "uint256", name: "walletCapAmount", type: "uint256" },
      { internalType: "uint256", name: "depositFee", type: "uint256" },
    ],
    "stateMutability": "view",
    "type": "function"
  },
  decimals: {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  }
};

async function getWCCPrice() {
  try {
    const response = await axios.get(
      `https://coins.llama.fi/prices/current/bsc:${WCC_ADDRESS.toLowerCase()}`
    );
    const priceData = response.data;
    if (priceData && priceData.coins && priceData.coins[`bsc:${WCC_ADDRESS.toLowerCase()}`]) {
      const price = priceData.coins[`bsc:${WCC_ADDRESS.toLowerCase()}`].price;
      return price;
    } else {
      return 0;
    }
  } catch (error) {
    return 0;
  }
}

const apy = async () => {
  const wccDecimalsCall = await sdk.api.abi.call({
    target: WCC_ADDRESS,
    chain: 'bsc',
    abi: abis.decimals,
  });
  const wccDecimals = Number(wccDecimalsCall.output);
  const wccPrice = await getWCCPrice();

  if (!wccPrice) {
    throw new Error('Failed to fetch WCC price');
  }

  const [apyCall, infoCall] = await Promise.all([
    sdk.api.abi.call({
      target: DEPOSIT_CONTRACT,
      chain: 'bsc',
      abi: abis.getCurrentAPY
    }),
    sdk.api.abi.call({
      target: DEPOSIT_CONTRACT,
      chain: 'bsc',
      abi: abis.getContractInfo
    })
  ]);

  const apyBase = Number(apyCall.output) / 1e4;
  const totalStakedAmountRaw = infoCall.output[2];
  const totalStakedAmount = Number(totalStakedAmountRaw) / (10 ** wccDecimals);
  const tvlUsd = totalStakedAmount * wccPrice;

  const pool = {
    pool: `${DEPOSIT_CONTRACT.toLowerCase()}-bsc`,
    chain: utils.formatChain('bsc'),
    project: PROJECT_NAME,
    symbol: 'WCC',
    tvlUsd,
    apyBase: apyBase * 100,
    underlyingTokens: [WCC_ADDRESS],
    poolMeta: 'EA Finance WCC Staking Pool',
    url: 'https://app.ea.finance/vaults',
  };

  return [pool];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.ea.finance/vaults',
};