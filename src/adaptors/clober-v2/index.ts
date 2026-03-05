const utils = require('../utils');

const API_URL = 'https://app.clober.io/api/chains/143/pools';

interface Pool {
  key: string;
  lpCurrency: {
    id: string;
    address: string;
    name: string;
    symbol: string;
    decimals: number;
  };
  currencyA: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
  };
  currencyB: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
  };
  totalTvlUSD: string;
  apy: string;
  baseApy: string;
  merkleApy: string;
}

const apy = async () => {
  const data: Array<Pool> = await utils.getData(API_URL);

  const pools = data.map((pool) => {
    const merkleApy = Number(pool.merkleApy) || 0;
    return {
      pool: pool.key,
      chain: utils.formatChain('monad'),
      project: 'clober-v2',
      symbol: pool.lpCurrency.symbol,
      tvlUsd: Number(pool.totalTvlUSD),
      apyBase: Number(pool.baseApy) || 0,
      apyReward: merkleApy,
      underlyingTokens: [pool.currencyA.address, pool.currencyB.address],
      rewardTokens:
        merkleApy > 0
          ? [
              '0x0000000000000000000000000000000000000000', // MON
            ]
          : [],
      url: `https://app.clober.io/earn/${pool.key}`,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
};
