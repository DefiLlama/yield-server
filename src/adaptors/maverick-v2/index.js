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
      const symbol = v.symbol;
      const lastHyphenIndex = symbol.lastIndexOf('-');
      const lastPart = symbol.slice(lastHyphenIndex - 1);
      const chain = networkMapping[v.chainId];
      return {
        pool: `${v.id}-${chain}`.toLowerCase(),
        chain: formatChain(chain),
        project: 'maverick-v2',
        symbol: formatSymbol(
          [v.position.pool.tokenA.symbol, v.position.pool.tokenB.symbol].join(
            '-'
          )
        ),
        tvlUsd: v.position.tvl.amount ?? 0,
        apyBase: (v.position.lastDayFeesAPR ?? 0) * 100,
        apyReward: (v.rewardAPR ?? 0) * 100,
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
        poolMeta: lastPart,
      };
    });

  return retValue;
};

module.exports = {
  timetravel: false,
  apy: main,
};
