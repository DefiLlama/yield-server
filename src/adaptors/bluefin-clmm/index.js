const axios = require('axios');

const apyDataUrl = 'https://swap.api.sui-prod.bluefin.io/api/v1/pools/apy/stats';

const apy = async () => {
  const response = await axios.get(apyDataUrl);
  const pools = response.data.data;

  return pools
    .map((p) => {
      const stats = p.apyStats[0];
      const apyBase = Number(stats.aprFee);
      const apyReward = Number(stats.aprRewards);
      // Extract reward token addresses from rewards array
      const rewardTokens = p.rewards?.map((reward) => reward.symbol) || [];
      return {
        pool: p.pool,
        chain: 'Sui',
        project: 'bluefin-spot',
        symbol: `${p.coinA.symbol}-${p.coinB.symbol}`,
        underlyingTokens: [p.coinA.coinType, p.coinB.coinType],
        rewardTokens,
        tvlUsd: Number(stats.tvlUsd),
        apyBase,
        apyReward: apyReward > 0 ? apyReward : 0,
        poolMeta: `(${Number(p.feeRate)}%)`,
        url: `https://trade.bluefin.io/deposit/${p.pool}`,
      };
    })
    .filter((i) => i.tvlUsd >= 1e4) // show pools with at least $10,000 TVL
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
};

module.exports = {
  apy,
};
