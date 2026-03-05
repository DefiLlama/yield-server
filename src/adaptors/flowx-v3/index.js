const axios = require('axios');

const chains = {
  sui: 'https://api.flowx.finance/flowx-be/api/explore-stats/top-pools',
};

const apy = async (chain) => {
  if (chain === 'sui') {
    let pools = (await axios.get(chains[chain])).data.data.filter(
      (it) => it.protocolVersion == 'V3'
    );
    return pools
      .map((p) => {
        return {
          pool: p.poolId,
          chain: chain,
          project: 'flowx-v3',
          symbol: `${p.coinX.symbol}/${p.coinY.symbol}`,
          underlyingTokens: [p.coinX.coinType, p.coinY.coinType],
          rewardTokens: p.stats.combinedApr?.rewardTokens?.map((it) => it.type),
          tvlUsd: Number(p.stats.totalLiquidityInUSD),
          apyBase: Number(p.stats.combinedApr.lpRewardsApr),
          apyReward: Number(p.stats.combinedApr.farmApr),
          volumeUsd1d: Number(p?.stats.volume24H),
          poolMeta: `${Number(p.feeRate) * 100}%`,
          url: `https://flowx.finance/explore/pools/${p.poolId}`,
        };
      })
      .filter((i) => i.tvlUsd <= 1e8);
  }
};

const main = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map((chain) => apy(chain))
  );

  return pools.flat();
};

module.exports = {
  apy: main,
};
