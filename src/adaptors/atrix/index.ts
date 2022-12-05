const utils = require('../utils');

const API_URL: string = 'https://api.atrix.finance/api/all';

interface Pool {
  key: string;
  marketData: {
    stats: { marketName: string };
  };
  farms: Array<{
    tvlUsd: number;
    apr: number;
    crops: Array<{ cropRewardTokenAccount: string }>;
  }>;
  mints: {
    base: {
      key: string;
      symbol: string;
    };
    quote: {
      key: string;
      symbol: string;
    };
  };
}

const getApy = async () => {
  const { pools } = await utils.getData(API_URL);
  const poolsWithFarms: Array<Pool> = pools.filter(({ farms }) => farms.length);

  const apy = poolsWithFarms.map((pool) => {
    return {
      pool: pool.key,
      chain: utils.formatChain('solana'),
      project: 'atrix',
      symbol: utils.formatSymbol(
        `${pool.mints.base.symbol}-${pool.mints.quote.symbol}`
      ),
      tvlUsd: pool.farms[0]?.tvlUsd || 0,
      apy: pool.farms[0]?.apr || 0,
      apyReward: pool.farms[0]?.apr || 0,
      underlyingTokens: [pool.mints.base.key, pool.mints.quote.key],
      rewardTokens: [pool.farms[0].crops[0].cropRewardTokenAccount],
      url: `https://app.atrix.finance/liquidity/${pool.key}/deposit`,
    };
  });

  return apy;
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
