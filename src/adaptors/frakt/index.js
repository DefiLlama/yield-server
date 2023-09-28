const utils = require('../utils');

const API_URL = 'https://api.frakt.xyz/liquidity/pools';
const SOLANA_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

const apy = async () => {
  const { pools } = await utils.getData(API_URL);

  const priceKey = 'coingecko:solana';
  const solana = (
    await utils.getData(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).coins[priceKey].price;

  return pools.map((pool) => ({
    pool: pool.liquidityPoolPubkey,
    chain: utils.formatChain('solana'),
    project: 'frakt',
    symbol: pool.name,
    tvlUsd: (pool.amountOfStaked / 1e9) * solana,
    apyBase: pool.depositApr / 100,
  }));
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://frakt.xyz/lend',
};
