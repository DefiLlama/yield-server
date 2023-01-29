const utils = require('../utils');

const API_URL = 'https://api.frakt.xyz/liquidity/pools';
const SOLANA_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

const apy = async () => {
  const { pools } = await utils.getData(API_URL);
  const { solana } = await utils.getData(SOLANA_PRICE_URL);

  return pools.map((pool) => ({
    pool: pool.liquidityPoolPubkey,
    chain: utils.formatChain('solana'),
    project: 'frakt',
    symbol: pool.name,
    tvlUsd: (pool.amountOfStaked / 1e9) * solana.usd,
    apyBase: pool.depositApr / 100,
  }));
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://frakt.xyz/lend',
};
