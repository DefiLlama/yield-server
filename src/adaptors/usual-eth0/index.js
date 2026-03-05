const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const CONFIG = {
  ETHEREUM: {
    ETH0: '0x734eec7930bc84eC5732022B9EB949A81fB89AbE',
    STETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    CHAIN: 'Ethereum',
  },
  USUAL_TOKEN: '0xC4441c2BE5d8fA8126822B9929CA0b81Ea0DE38E',
  ETH0_SYMBOL: 'ETH0',
  USUAL_SYMBOL: 'USUAL',
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

async function getETH0ChainData(chainConfig) {
  const supply = await getTokenSupply(chainConfig.CHAIN, chainConfig.ETH0);
  const price = await getTokenPrice(chainConfig.CHAIN, chainConfig.STETH);
  return { supply, price };
}

const apy = async () => {
  const rewardEth0 = await getRewardData(
    CONFIG.ETH0_SYMBOL,
    CONFIG.USUAL_SYMBOL
  );
  const apyRewardEth0 = utils.aprToApy(rewardEth0.apr, CONFIG.WEEKS_PER_YEAR);
  const eth0Data = await getETH0ChainData(CONFIG.ETHEREUM);

  return [
    {
      pool: CONFIG.ETHEREUM.ETH0,
      chain: CONFIG.ETHEREUM.CHAIN,
      project: 'usual-eth0',
      symbol: CONFIG.ETH0_SYMBOL,
      tvlUsd: eth0Data.supply * eth0Data.price,
      apyReward: apyRewardEth0,
      rewardTokens: [CONFIG.USUAL_TOKEN],
      underlyingTokens: [CONFIG.ETHEREUM.STETH],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://app.usual.money/swap?action=stake',
};
