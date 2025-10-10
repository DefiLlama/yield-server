const axios = require('axios');

async function getPoolsForSystem(settings) {
  const { data } = await axios.get(
    `https://autopools-api.tokemaklabs.com/api/${settings.chainId}/${settings.systemName}`
  );

  const pools = data.autopools.map((pool) => {
    const rewardTokens = new Set(pool.rewards.map((x) => x.rewardToken));
    const apyReward = pool.rewards.reduce((p, c) => {
      return p + c.rewardApy;
    }, 0);

    return {
      pool: pool.id,
      chain: settings.chainName,
      project: 'autofinance',
      symbol: pool.baseAssetSymbol,
      tvlUsd: Number(pool.tvlUsd),
      rewardTokens: Array.from(rewardTokens),
      underlyingTokens: [pool.baseAssetId],
      apyBase: Number(pool.baseApy),
      apyReward: apyReward,
      url: 'https://app.auto.finance/autopool?id=' + pool.id,
      poolMeta: pool.symbol,
    };
  });

  return pools;
}

async function main() {
  const { data } = await axios.get(
    'https://v2-config.tokemaklabs.com/api/systems'
  );
  const systems = data
    .filter((x) => x.publishToDefillama)
    .map((x) => {
      return {
        chainId: Number(x.chainId),
        systemName: x.systemName,
        chainName: x.chainName,
      };
    });

  const pools = [];
  for (const system of systems) {
    pools.push(...(await getPoolsForSystem(system)));
  }
  console.log(pools);
  return pools;
}

module.exports = {
  timeTravel: false,
  apy: main,
  url: 'https://app.auto.finance',
};
