const utils = require('../utils');
const sdk = require('@defillama/sdk');

const API_URL = 'https://api.raydium.io/v2/main/pairs';

interface Pool {
  lpMint: string;
  name: string;
  liquidity: string;
  apr7d: number;
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
      apy: pool.apr7d,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://raydium.io/pools/',
};
