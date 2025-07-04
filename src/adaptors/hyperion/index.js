const utils = require('../utils');

const POOL_LIST_URL = 'https://assets.hyperion.xyz/files/pool-list.json';

function aprToApy(apr) {
  if (apr === undefined || apr === null) {
    return 0;
  }
  return (Math.pow(1 + Number(apr) / 100 / 365, 365) - 1) * 100;
}

async function apy() {
  const liquidityPools = (await utils.getData(POOL_LIST_URL))?.data;
  if (!liquidityPools) {
    return [];
  }

  const result = [];
  for (const pool of liquidityPools) {
    if (pool.pool.isPublic === false) {
      continue;
    }

    const poolId = pool.pool.poolId;
    const feeAPR = pool.feeAPR;
    const farmAPR = pool.farmAPR;
    const tvl = pool.tvlUSD;
    const tokenA = pool.pool.token1;
    const tokenB = pool.pool.token2;
    const symbolA = pool.pool.token1Info.symbol;
    const symbolB = pool.pool.token2Info.symbol;

    result.push({
      pool: `${poolId}-aptos`,
      chain: utils.formatChain('aptos'),
      project: 'hyperion',
      symbol: `${symbolA}-${symbolB}`,
      tvlUsd: Number(tvl),
      apyBase: aprToApy(feeAPR),
      apyReward: aprToApy(farmAPR),
      rewardTokens: pool.pool.farm.map((item) => item.rewardFa),
      underlyingTokens: [tokenA, tokenB],
      url: `https://hyperion.xyz/pool/${poolId}`,
      poolMeta: `${Number(pool.pool.feeRate) / 10000}%`,
    });
  }

  return result;
}

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://hyperion.xyz/pools',
};
