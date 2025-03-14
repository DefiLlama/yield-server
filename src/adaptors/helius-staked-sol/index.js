const axios = require('axios');
const { getTotalSupply } = require('../utils');

const HSOL_ADDRESS = 'he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A';
const priceKey = `solana:${HSOL_ADDRESS}`;

const apy = async () => {
  const totalSupply = await getTotalSupply(HSOL_ADDRESS);

  const priceResponse = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  const currentPrice = priceResponse.data.coins[priceKey].price;

  const apyResponse = await axios.get(
    `https://extra-api.sanctum.so/v1/apy/latest?lst=${HSOL_ADDRESS}`
  );
  const apy = apyResponse.data.apys[HSOL_ADDRESS];

  return [
    {
      pool: HSOL_ADDRESS,
      chain: 'Solana',
      project: 'helius-staked-sol',
      symbol: 'HSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase: apy * 100,
      underlyingTokens: [HSOL_ADDRESS],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.helius.dev/blog/solana-staking-simplified-guide-to-sol-staking#what-is-liquid-staking',
};
