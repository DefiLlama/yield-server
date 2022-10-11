const { request } = require('graphql-request');

const utils = require('../utils');
const { query } = require('./query');

const API_URL = 'https://api.maple.finance/v1/graphql';

interface Pool {
  poolName: string;
  liquidityAsset: {
    price: number;
    symbol: string;
    decimals: number;
    address: string;
  };
  liquidity: string;
  lendingApy: string;
  farmingApy: string;
  poolDelegate: { companyName: string };
  poolPositions: Array<PoolPositions>;
}

interface Pools {
  results: { list: Array<Pool> };
}

interface PoolPositions {
  id: string;
}

const apy = async () => {
  const {
    results: { list: data },
  }: Pools = await request(API_URL, query, {
    filter: { skip: 0, limit: 100 },
  });

  const pools = data.map((pool) => {
    // exclude permissioned pools
    if (pool.poolName.toLowerCase().includes('permissioned')) return {};

    const tokenPrice = pool.liquidityAsset.price / 1e8;

    return {
      pool: pool.poolPositions[0]?.id.split('-')[1],
      chain: utils.formatChain('ethereum'),
      project: 'maple',
      symbol: pool.liquidityAsset.symbol,
      poolMeta: pool.poolDelegate.companyName,
      tvlUsd:
        (Number(pool.liquidity) * tokenPrice) /
        10 ** pool.liquidityAsset.decimals,
      apyBase: Number(pool.lendingApy) / 100,
      apyReward: Number(pool.farmingApy) / 100,
      underlyingTokens: [pool.liquidityAsset.address],
      rewardTokens: [
        '0x33349b282065b0284d756f0577fb39c158f935e6', //MAPLE
      ],
    };
  });
  return pools.filter((p) => p.pool);
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.maple.finance/#/earn',
};
