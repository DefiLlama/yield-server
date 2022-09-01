const utils = require('../utils');

const STAKING_API = 'https://gateway.mdex.one/v3/boardroom/pools?mdex_chainid=';
const LP_API = 'https://gateway.mdex.one/v3/mingpool/lps?mdex_chainid=';

const CHAINS = {
  Binance: 56,
  Heco: 128,
};

const apy = async () => {
  const dataStaking = await Promise.all(
    Object.entries(CHAINS).map(async ([chain, id]) => [
      chain,
      (await utils.getData(STAKING_API + id)).result,
    ])
  );
  const dataLp = await Promise.all(
    Object.entries(CHAINS).map(async ([chain, id]) => [
      chain,
      (await utils.getData(LP_API + id)).result,
    ])
  );

  const stakingPools = dataStaking.map(([chain, pools]) => {
    return Object.entries(pools).map(([name, poolsArr]) => {
      return poolsArr.map((pool) => {
        const symbol = pool.pool_name.replace('/', '-');

        return {
          pool: `${pool.contract}-${chain}-${symbol}`,
          chain,
          project: 'mdex',
          symbol,
          tvlUsd: pool.pool_tvl,
          apyReward: pool.pool_apy,
          underlyingTokens: [pool.pool_token],
          rewardTokens: [pool.earned_address],
        };
      });
    });
  });

  const lpPools = dataLp.map(([chain, pools]) => {
    return Object.values(pools).map((pool) => {
      if (!pool.token0) return;
      const symbol = pool.pool_name.replace('/', '-');
      return {
        pool: `${pool.address}-${chain}-${symbol}`,
        chain,
        project: 'mdex',
        symbol,
        tvlUsd: pool.pool_tvl,
        apyBase: pool.swap_apy * 100,
        apyReward: pool.pool_apy * 100,
        underlyingTokens: [pool.token0, pool.token1],
        rewardTokens: [
          '0x9c65ab58d8d978db963e63f2bfb7121627e3a739', // MDEX
        ],
      };
    });
  });

  return lpPools.concat(stakingPools).flat(Infinity).filter(Boolean);
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://mdex.com/#/boardroom',
};
