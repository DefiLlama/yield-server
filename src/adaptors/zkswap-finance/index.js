const utils = require('../utils');

const url = 'https://zkswap-dex-api.zkswap.finance/api/yeild-farm';
const rewardsTokens = "0x31C2c031fDc9d33e974f327Ab0d9883Eae06cA4A"

const getPoolInfo = async () => {
  const zkswapData = await utils.getData(url);

  const pools = zkswapData.map((poolInfo) => {
    const rewardTokens = poolInfo.rewards.map((info) => {
      return info.address;
    });

    const token0 =  poolInfo.baseToken?.address.toLowerCase()
    const token1 =  poolInfo.quoteToken?.address.toLowerCase()

    return {
      pool: poolInfo.address.toLowerCase(),
      chain: 'era',
      project: 'zkswap-finance',
      symbol: poolInfo.symbol,
      tvlUsd: poolInfo.tvl,
      apyReward: poolInfo.totalApr,
      rewardTokens: [rewardsTokens.toLowerCase()],
      apyBase: poolInfo.tradingApr,
      apyReward: poolInfo.apr,
      underlyingTokens: token0 && token1? [token0, token1]: [poolInfo.address.toLowerCase()],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPoolInfo,
  url: 'https://zkswap.finance/earn',
};
