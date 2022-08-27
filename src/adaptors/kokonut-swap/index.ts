const utils = require('../utils');

const API_URL = 'https://prod.i4i-api.com/pools';

interface Pool {
  address: string;
  symbol: string;
  tvl: string;
  coins: Array<string>;
  baseApr: string;
  stakingApr: string;
}

interface Pools {
  pools: Array<Pool>;
}

const apy = async () => {
  const { pools: data }: Pools = await utils.getData(API_URL);

  const pools = data.map((pool) => {
    return {
      pool: pool.address,
      chain: utils.formatChain('klaytn'),
      project: 'kokonut-swap',
      symbol: pool.symbol,
      tvlUsd: Number(pool.tvl),
      apyBase: Number(pool.baseApr) || 0,
      apyReward: Number(pool.stakingApr) || 0,
      underlyingTokens: pool.coins,
      rewardTokens: [
        '0xcd670d77f3dcab82d43dff9bd2c4b87339fb3560', // KOKOS
      ],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://kokonutswap.finance/pools',
};
