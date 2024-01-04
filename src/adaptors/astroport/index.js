const axios = require('axios');
const num = require('bignumber.js');

const chainIdToNames = {
  'phoenix-1': 'Terra2',
  'injective-1': 'Injective',
  'neutron-1': 'Neutron',
  'pacific-1': 'Sei',
};

const astroDenoms = {
  'phoenix-1':
    'terra1nsuqsk6kh58ulczatwev87ttq2z6r3pusulg9r24mfj2fvtzd4uq3exn26',
  'injective-1':
    'ibc/EBD5A24C554198EBAF44979C5B4D2C2D312E6EBAB71962C92F735499C7575839',
  'neutron-1':
    'ibc/5751B8BCDA688FD0A8EC0B292EEF1CDEAB4B766B63EC632778B196D317C40C3A',
  'pacific-1':
    'ibc/0EC78B75D318EA0AAB6160A12AEE8F3C7FEA3CFEAD001A3B103E11914709F4CE',
};

const getRewardTokens = (pool) => {
  const rewardTokens = [];
  if (pool?.protocolRewards?.apr > 0) {
    rewardTokens.push(pool?.rewardTokenSymbol);
  }
  if (pool?.astroRewards?.apr > 0) {
    rewardTokens.push(astroDenoms[pool.chainId]);
  }
  return rewardTokens.length > 0 ? rewardTokens : undefined;
};

const apy = async () => {
  let results = (
    await axios.get(
      'https://app.astroport.fi/api/trpc/pools.getAll?input=%7B%22json%22%3A%7B%22chainId%22%3A%5B%22neutron-1%22%5D%7D%7D'
    )
  ).data.result.data.json;

  const apy = results
    ?.filter((pool) => pool?.poolLiquidityUsd && pool?.poolLiquidityUsd > 10000)
    .map((pool) => {
      const apyBase = pool?.tradingFees?.apy
        ? new num(pool?.tradingFees?.apy).times(100).dp(6).toNumber()
        : 0;
      const chain = chainIdToNames[pool.chainId];
      const astroRewards = pool?.astroRewards?.apr || 0;
      const protocolRewards = pool?.protocolRewards?.apr || 0;
      const apyReward = new num(astroRewards)
        .plus(protocolRewards)
        .times(100)
        .dp(6)
        .toNumber();

      return {
        pool: `${pool.poolAddress}-${chain}`.toLowerCase(),
        project: 'astroport',
        chain,
        symbol: `${pool.assets[0].symbol}-${pool.assets[1].symbol}`,
        tvlUsd: pool.poolLiquidityUsd || 0,
        apyBase,
        apyReward,
        rewardTokens: getRewardTokens(pool) ?? null,
        underlyingTokens: [pool.token0Address, pool.token1Address],
        url: `https://app.astroport.fi/pools/${pool.poolAddress}/provide`,
      };
    });

  return apy;
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.astroport.fi/pools/',
};
