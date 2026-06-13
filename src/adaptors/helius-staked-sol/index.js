const axios = require('axios');
const { getTotalSupply, getSanctumLstApy } = require('../utils');

const HSOL_ADDRESS = 'he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A';
const SOL = 'So11111111111111111111111111111111111111112';
const priceKey = `solana:${HSOL_ADDRESS}`;

const apy = async () => {
  const [totalSupply, priceResponse, apyBase] = await Promise.all([
    getTotalSupply(HSOL_ADDRESS),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getSanctumLstApy(HSOL_ADDRESS),
  ]);

  const currentPrice = priceResponse.data.coins[priceKey].price;
  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${HSOL_ADDRESS}`);

  return [
    {
      pool: HSOL_ADDRESS,
      chain: 'Solana',
      project: 'helius-staked-sol',
      symbol: 'HSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      searchTokenOverride: HSOL_ADDRESS,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.helius.dev/blog/solana-staking-simplified-guide-to-sol-staking#what-is-liquid-staking',
};
