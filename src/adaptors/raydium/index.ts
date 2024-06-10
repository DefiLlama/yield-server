const utils = require('../utils');

const API_URL = 'https://api.raydium.io/v2/main/pairs';

interface Pool {
  lpMint: string;
  name: string;
  liquidity: string;
  apr24h: number;
}

type Pools = Array<Pool>;

const apy = async () => {
  const data: Pools = await utils.getData(API_URL);

  const pools = data.map((pool) => {
    return {
      pool: pool.lpMint,
      chain: utils.formatChain('solana'),
      project: 'raydium',
      symbol: pool.name,
      tvlUsd: pool.liquidity,
      apyBase: pool.apr24h,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://raydium.io/pools/',
};
