const standardPools = 'https://app.meteora.ag/amm/pools/v1?page=0&size=100';
const clPools =
  'https://app.meteora.ag/clmm-api/pair/all_by_groups?page=0&limit=100&unknown=true&sort_key=volume&order_by=desc';

const apy = async () => {
  const response = await fetch(standardPools);
  const data = await response.json();
  return data.data.map((pool) => {
    return {
      pool: pool.pool_address,
      chain: 'Solana',
      project: 'meteora',
      symbol: pool.pool_name,
      underlyingTokens: p.pool_token_mints,
      tvlUsd: pool.pool_tvl,
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
    };
  });
};

module.exports = { apy };
