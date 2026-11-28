const utils = require('../utils');

const API_URL =
  'https://api-v3.raydium.io/pools/info/list?poolType=all&poolSortField=default&sortType=desc&pageSize=1000&page=1';

// raydium's tvl values a mint coins.llama.fi can't price at the pool's own
// price, so a pool holding ~all of a fresh mint's supply against 40k USDC
// reports $33M (XDC-USDC, 2026-11-16). an unpriced side takes the pool's
// price, capped at the priced side, as in uniswap-v4. never above raydium's
const tvlUsd = (pool, prices) => {
  const priceOf = (mint) => {
    const price = prices[`solana:${mint?.address}`]?.price;
    return price > 0 ? price : undefined;
  };
  const priceA = priceOf(pool.mintA);
  const priceB = priceOf(pool.mintB);
  if (priceA === undefined && priceB === undefined) return 0;
  if (priceA !== undefined && priceB !== undefined) return pool.tvl;
  const [priced, unpriced] =
    priceA === undefined
      ? [pool.mintAmountB * priceB, pool.mintAmountA * pool.price * priceB]
      : [pool.mintAmountA * priceA, (pool.mintAmountB / pool.price) * priceA];
  // no usable pool price: the priced side alone
  const tvl = pool.price > 0 ? priced + Math.min(unpriced, priced) : priced;
  return Number.isFinite(tvl) ? Math.min(pool.tvl, tvl) : pool.tvl;
};

const apy = async () => {
  const data = (await utils.getData(API_URL)).data.data;
  const mints = data.flatMap((p) => [p.mintA?.address, p.mintB?.address]);
  const prices = await utils.getPriceApiCoins(
    [...new Set(mints.filter(Boolean))].map((m) => `solana:${m}`)
  );

  return data.map((pool) => {
    const apyReward = pool.day.rewardApr.reduce((v, acc) => v + acc, 0);
    const underlyingTokens = [pool.mintA?.address, pool.mintB?.address].filter(Boolean);
    return {
      pool: pool.id,
      chain: 'Solana',
      project: 'raydium-amm',
      symbol: `${pool.mintA.symbol}-${pool.mintB.symbol}`,
      tvlUsd: tvlUsd(pool, prices),
      apyBase: pool.day.feeApr,
      apyReward,
      rewardTokens:
        apyReward > 0
          ? pool?.rewardDefaultInfos?.map((r) => r.mint?.address)
          : [],
      apyBase7d: pool.week.feeApr,
      volumeUsd1d: pool.day.volume,
      volumeUsd7d: pool.week.volume,
      poolMeta: `${pool.type} - ${pool.feeRate * 100}%`,
      url:
        pool.type.toLowerCase() === 'concentrated'
          ? `https://raydium.io/clmm/create-position/?pool_id=${pool.id}`
          : `https://raydium.io/liquidity/increase/?mode=add&pool_id=${pool.id}`,
      ...(underlyingTokens.length > 0 && { underlyingTokens }),
    };
  });
};

module.exports = {
  protocolId: '214',
  apy,
};
