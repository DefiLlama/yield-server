const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const CONFIG = {
  ETHEREUM: {
    SEUR0: '0x35f43C6604B0DE814ABAa2D94C878BD1F5165478',
    EUR0: '0x3c89Cd1884E7beF73ca3ef08d2eF6EC338fD8E49',
    EUROC: '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c',
    CHAIN: 'Ethereum',
  },
  SEUR0_SYMBOL: 'sEUR0',
  EUR0_SYMBOL: 'EUR0',
  URLS: {
    REWARD_APR_RATE: 'https://app.usual.money/api/tokens/yields',
    LLAMA_PRICE: 'https://coins.llama.fi/prices/current/',
  },
  SCALAR: 1e18,
  WEEKS_PER_YEAR: 52,
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

async function getTokenPrice(chain, address) {
  const priceKey = `${chain.toLowerCase()}:${address}`;
  const { data } = await axios.get(`${CONFIG.URLS.LLAMA_PRICE}${priceKey}`);
  return data.coins[priceKey].price;
}

async function getRewardData(pool, reward) {
  const { data } = await axios.get(`${CONFIG.URLS.REWARD_APR_RATE}`);
  const apr = data[pool]?.[reward];

  if (!apr) {
    throw new Error(`Reward "${reward}" not found for pool "${pool}"`);
  }

  return { apr };
}

async function getTotalAssets(chain, address) {
  const { output } = await sdk.api.abi.call({
    chain: chain.toLowerCase(),
    target: address,
    abi: 'function totalAssets() view returns (uint256)',
  });
  return output / CONFIG.SCALAR;
}

async function getChainDataSEUR0(chainConfig) {
  const assets = await getTotalAssets(chainConfig.CHAIN, chainConfig.SEUR0);
  // fetches the price of EUROC (Circle's euro stablecoin) as EUR0 price is not available
  const price = await getTokenPrice(chainConfig.CHAIN, chainConfig.EUROC);
  return { assets, price };
}

const apy = async () => {
  const rewardSEUR0 = await getRewardData(
    CONFIG.SEUR0_SYMBOL,
    CONFIG.EUR0_SYMBOL
  );
  const apyRewardSEUR0 = utils.aprToApy(rewardSEUR0.apr, CONFIG.WEEKS_PER_YEAR);
  const seur0Data = await getChainDataSEUR0(CONFIG.ETHEREUM);

  return [
    {
      pool: CONFIG.ETHEREUM.SEUR0,
      chain: CONFIG.ETHEREUM.CHAIN,
      project: 'usual-eur0',
      symbol: CONFIG.SEUR0_SYMBOL,
      tvlUsd: seur0Data.assets * seur0Data.price,
      apyBase: apyRewardSEUR0, // weekly compounding for sEUR0 APY
      apyReward: 0, // No additional reward for sEUR0
      rewardTokens: [CONFIG.ETHEREUM.EUR0],
      poolMeta: 'EUR0 Savings',
      underlyingTokens: [CONFIG.ETHEREUM.EUR0],
      url: 'https://app.usual.money/swap?action=stake&from=EUR0&to=sEUR0',
    },
  ];
};

module.exports = {
  apy,
  url: 'https://app.usual.money/swap?action=stake',
};
