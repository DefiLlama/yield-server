const axios = require('axios');
const utils = require('../utils');

axios.interceptors.request.use(config => {
  config.headers["key"] = 'PgYaEZwSmjCQB74KIFN3f58LcuOoUhdv2t1XipJzWVnkrMGRT9H6exl0bqyDAs';
  return config;
})

function formatSymbol(sourceName) {
  const space = sourceName.indexOf(' ');
  return `${sourceName.substring(space + 1)} (${sourceName.substring(
    0,
    space
  )})`;
}

async function apy(chain) {
  const response = (
    await axios.get(
      `https://app.mole.fi/api/${chain}/data.json`
    )
  ).data;

  const fairLaunchStakingPools = response.pools.filter(
    (p) => !p.key.includes('debt')
  ).map((p) => ({
    pool: `${p.address}-staking`,
    chain: utils.formatChain(chainMapping[chain]),
    project: 'mole',
    symbol: utils.formatSymbol(p.symbol),
    tvlUsd: Number(p.tvl),
    apy: Number(p.apy),
  }));

  const hedgePools = response.hedges.map((p) => ({
    pool: `${p.key}-hedge-pool`,
    chain: utils.formatChain(chainMapping[chain]),
    project: 'mole',
    symbol: utils.formatSymbol(p.iuToken.symbol),
    tvlUsd: Number(p.tvl),
    apy: Number(p.apy),
  }));

  const farmingPools = response.farms.map((p) => ({
    pool: `${p.key}-farming-pool`,
    chain: utils.formatChain(chainMapping[chain]),
    project: 'mole',
    symbol: formatSymbol(p.sourceName),
    tvlUsd: Number(p.tvl),
    apy: utils.aprToApy(
      (Number(p.farmRewardApr) + Number(p.tradingFeeApr)) / p.leverage
    ),
  }));

  const lendingPools = response.vaults.map((p) => ({
    pool: `${p.address}-lending`,
    chain: utils.formatChain(chainMapping[chain]),
    project: 'mole',
    symbol: utils.formatSymbol(p.symbol),
    tvlUsd: Number(p.tvl),
    apy: Number(p.totalApy),
  }));

  return [
    ...fairLaunchStakingPools,
    ...hedgePools,
    ...farmingPools,
    ...lendingPools,
  ];
}

const chainMapping = {
  '43114': 'avalanche',
};

const main = async () => {
  const [avax] = await Promise.all([apy('43114')]);
  return [...avax];
};

module.exports = {
  timetravel: false,
  apy: main,
};