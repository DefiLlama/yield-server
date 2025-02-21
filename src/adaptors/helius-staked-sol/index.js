const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const HSOL_ADDRESS = 'he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A'

const getApy = async () => {
  const hsolData = await utils.getData("https://api.coingecko.com/api/v3/coins/helius-staked-sol")

  const totalSupply = hsolData.market_data.total_supply
  const currentPrice = hsolData.market_data.current_price.usd

  const apy =
    (
     await utils.getData(`https://extra-api.sanctum.so/v1/apy/latest?lst=${HSOL_ADDRESS}`)
    ).apys[HSOL_ADDRESS];

  return [
    {
      pool: HSOL_ADDRESS,
      chain: utils.formatChain('solana'),
      project: 'helius-staked-sol',
      symbol: utils.formatSymbol('hsol'),
      tvlUsd: totalSupply * currentPrice,
      apyBase: apy * 100,
      underlyingTokens: [HSOL_ADDRESS],
    },
  ];
};

module.exports = { apy: getApy, url: 'https://www.helius.dev/blog/solana-staking-simplified-guide-to-sol-staking#what-is-liquid-staking' };