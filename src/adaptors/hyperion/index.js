const utils = require('../utils');

// pool-list.json stopped updating on 2026-05-30; pool-list-new.json is the live list
const POOL_LIST_URL = 'https://assets.hyperion.xyz/files/pool-list-new.json';

function aprToApy(apr) {
  if (apr === undefined || apr === null) {
    return 0;
  }
  return (Math.pow(1 + Number(apr) / 100 / 365, 365) - 1) * 100;
}

// FA tokens paired with a legacy coin can be priced under either key; try the coin type first
const priceKeys = (token, info) =>
  [info?.coinType, token].filter(Boolean).map((key) => `aptos:${key}`);

async function apy() {
  const liquidityPools = (
    await utils.getEgressData(
      'hyperion/files/pool-list-new.json',
      POOL_LIST_URL
    )
  )?.data;
  if (!liquidityPools) {
    return [];
  }

  const publicPools = liquidityPools.filter(
    (pool) => pool.pool.isPublic !== false
  );
  const prices = await utils.getPriceApiCoins([
    ...new Set(
      publicPools.flatMap(({ pool }) => [
        ...priceKeys(pool.token1, pool.token1Info),
        ...priceKeys(pool.token2, pool.token2Info),
      ])
    ),
  ]);
  const reserveUsd = (amount, token, info) => {
    const price = priceKeys(token, info)
      .map((key) => prices[key]?.price)
      .find((price) => price !== undefined);
    const usd = (Number(amount) / 10 ** info?.decimals) * price;
    return Number.isFinite(usd) ? usd : undefined;
  };

  const result = [];
  for (const pool of publicPools) {
    const poolId = pool.pool.poolId;
    const feeAPR = pool.feeAPR;
    const farmAPR = pool.farmAPR;
    const tokenA = pool.pool.token1;
    const tokenB = pool.pool.token2;
    const symbolA = pool.pool.token1Info.symbol;
    const symbolB = pool.pool.token2Info.symbol;

    // price the pool's reserves instead of trusting the list's tvlUSD;
    // skip pools missing a price on either side
    const tvlA = reserveUsd(pool.pool.token1Reserve, tokenA, pool.pool.token1Info);
    const tvlB = reserveUsd(pool.pool.token2Reserve, tokenB, pool.pool.token2Info);
    if (tvlA === undefined || tvlB === undefined) {
      continue;
    }

    result.push({
      pool: `${poolId}-aptos`,
      chain: utils.formatChain('aptos'),
      project: 'hyperion',
      symbol: `${symbolA}-${symbolB}`,
      tvlUsd: tvlA + tvlB,
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
  protocolId: '5480',
  timetravel: false,
  apy: apy,
  url: 'https://hyperion.xyz/pools',
};
