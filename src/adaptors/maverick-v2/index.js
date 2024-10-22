const { formatChain, formatSymbol, getData } = require('../utils');

const url = 'https://v2-api.mav.xyz/api/v5/rewardContracts';

const networkMapping = {
  1: 'ethereum',
  56: 'bsc',
  324: 'zksync',
  8453: 'base',
  42161: 'arbitrum',
  534352: 'scroll',
};

const main = async () => {
  const apiData = (await getData(url)).rewardContracts;
  const retValue = apiData
    .filter((v) => !v.number.includes('*'))
    .filter((v) => !(v.position.tvl.amount === null))
    .map((v) => {
      const chain = networkMapping[v.chainId];
      return {
        pool: `${v.id}-${chain}`.toLowerCase(),
        chain: formatChain(chain),
        project: 'maverick-v2',
        symbol: v.symbol,
        tvlUsd: v.position.tvl.amount,
        apyBase: v.position.pool.apr,
        apyReward: v.rewardAPR,
        rewardTokens: v.rewards
          .filter((r) => r.totalRewardValueRemaining.amount != 0)
          .map((q) => {
            return q.rewardToken.address;
          }),
        underlyingTokens: [
          v.position.pool.tokenA.address,
          v.position.pool.tokenB.address,
        ],
        url: `https://app.mav.xyz/boosted-position/${v.boostedPositionAddress}/${v.id}?chain=${v.chainId}&f=true`,
      };
    });

  return retValue;
};

module.exports = {
  timetravel: false,
  apy: main,
};
