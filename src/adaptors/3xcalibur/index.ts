const utils = require('../utils');

const API_URL: string = 'https://api.3xcalibur.com/api/dex/pairs';

interface Pool {
  address: string;
  token0: { address: string; symbol: string };
  token1: Pool['token0'];
  tvl: number;
  apy: number;
}

type Response = Array<Pool>;

const getApy = async () => {
  const poolsRes: Response = await utils.getData(API_URL);

  const pools = poolsRes.map((pool) => {
    return {
      pool: pool.address,
      chain: utils.formatChain('arbitrum'),
      project: '3xcalibur',
      symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
      tvlUsd: pool.tvl,
      apyReward: pool.apy,
      underlyingTokens: [pool.token0.address, pool.token1.address],
      rewardTokens: [
        '0xd2568acCD10A4C98e87c44E9920360031ad89fCB', // xcal
      ],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.3xcalibur.com/swap/liquidity/add',
};
