/**
 * DEPRECATED: This adapter is no longer functional.
 * The DotDot Finance API (api.dotdot.finance) is unavailable.
 * Website and API return HTTP 402 "Payment Required / DEPLOYMENT_DISABLED".
 * Protocol TVL is minimal (~$36K) with near-zero trading activity.
 * Excluded from yield server in src/utils/exclude.js
 * Date: 2026-02-01
 */
const utils = require('../utils');

const API_URL: string = 'https://api.dotdot.finance/api/lpDetails';
const STAKING_URL = 'https://api.dotdot.finance/api/pool2';

interface Pool {
  pool: string;
  token: string;
  symbol: string;
  dddAPR: number;
  epxAPR: number;
  extraRewardsTotalApr: number;
  dddTvlUSD: number;
  baseApr?: number;
  extraRewards: Array<{ address: string }>;
}

interface Staking {
  data: {
    token0: string;
    token1: string;
    symbol0: string;
    symbol1: string;
    totalLpStakedUSD: number;
    apr: number;
  };
}

interface Response {
  data: { tokens: Array<Pool> };
}

const getApy = async () => {
  const {
    data: { tokens },
  }: Response = await utils.getData(API_URL);
  const { data: staking }: Staking = await utils.getData(STAKING_URL);

  const stakingPool = {
    pool: `${staking.token0}-dot-dot-finance`,
    chain: utils.formatChain('binance'),
    project: 'dot-dot-finance',
    symbol: `${staking.symbol0}-${staking.symbol1}`,
    tvlUsd: staking.totalLpStakedUSD,
    apyReward: staking.apr,
    underlyingTokens: [staking.token0, staking.token1],
    rewardTokens: [staking.token0],
  };

  const pools = tokens.map((pool) => {
    const apyReward =
      pool.dddAPR + pool.epxAPR + (pool.extraRewardsTotalApr || 0);
    return {
      pool: `${pool.pool}-dot-dot-finance`,
      chain: utils.formatChain('binance'),
      project: 'dot-dot-finance',
      symbol: utils.formatSymbol(
        pool.symbol.replace('val3EPS', 'valBUSD/valUSDC/valUSDT')
      ),
      tvlUsd: pool.dddTvlUSD,
      apyReward,
      apyBase: pool.baseApr || 0,
      underlyingTokens: [pool.token],
      rewardTokens: [
        '0xaf41054c1487b0e5e2b9250c0332ecbce6ce9d71', // EPX
        '0x84c97300a190676a19D1E13115629A11f8482Bd1', // DDD,
        ...pool.extraRewards.map(({ address }) => address),
      ],
    };
  });
  const res = [...pools, stakingPool].filter((p) => utils.keepFinite(p));

  return res;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://dotdot.finance/#/stake',
};
