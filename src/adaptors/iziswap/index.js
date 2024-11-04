const utils = require('../utils');

const url = 'https://izumi.finance/api/v1/farm/dashboard/?status=LIVE';

const chain = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
  1313161554: 'aurora',
  25: 'cronos',
  324: 'zksync_era',
  5000: 'mantle',
  169: 'manta',
  534352: 'scroll',
};

const getApy = async () => {
  const urlData = await utils.getData(url);
  const data = urlData.data.data;

  const pools = data.map((poolInfo) => {
    const rewardTokens = poolInfo.rewards.map((info) => {
      return info.address;
    });

    return {
      pool: poolInfo.pool_address.toLowerCase(),
      chain: chain[poolInfo.chain_id]
        ? utils.formatChain(chain[poolInfo.chain_id])
        : null,
      project: 'iziswap',
      symbol: `${poolInfo.tokenX_symbol}-${poolInfo.tokenY_symbol}`,
      tvlUsd: poolInfo.tvl,
      apyReward: poolInfo.apr.length > 1 ? poolInfo.apr[1] : poolInfo.apr[0],
      rewardTokens: rewardTokens,
      underlyingTokens: [poolInfo.tokenX_address, poolInfo.tokenY_address],
    };
  });

  return pools.filter((i) => i.chain);
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://izumi.finance/farm',
};
