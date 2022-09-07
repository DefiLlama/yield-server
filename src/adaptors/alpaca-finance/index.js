const axios = require('axios');
const utils = require('../utils');

async function apy(chain) {
  const response = (
    await axios.get(
      `https://alpaca-static-api.alpacafinance.org/${chain}/v1/landing/summary.json`
    )
  ).data.data;

  const filteredStakingPools = response.fairLaunchStakingPools.filter(
    (p) => !p.key.includes('debt')
  );

  const chainString = utils.formatChain(chainMapping[chain]);

  const fairLaunchStakingPools = filteredStakingPools.map((p) => ({
    pool: `${p.stakingToken.address}-staking-${chainString}`.toLowerCase(),
    chain: chainString,
    project: 'alpaca-finance',
    symbol: utils.formatSymbol(p.symbol.split(' ')[0]),
    tvlUsd: Number(p.tvl),
    apy: Number(p.apy),
  }));

  const strategyPools = response.strategyPools.map((p) => ({
    pool: `${p.address}-${chainString}`.toLowerCase(),
    chain: chainString,
    project: 'alpaca-finance',
    symbol: p.workingToken.symbol.split(' ')[0],
    poolMeta: p.name,
    tvlUsd: Number(p.tvl),
    apy: Number(p.apy),
  }));

  const farmingPools = response.farmingPools.map((p) => ({
    pool: `${p.workingToken.address}-farming-${chainString}`.toLowerCase(),
    chain: chainString,
    project: 'alpaca-finance',
    symbol: p.sourceName.split(' ')[1],
    poolMeta: p.sourceName.split(' ')[0],
    tvlUsd: Number(p.tvl),
    apy: utils.aprToApy(
      (Number(p.farmRewardApr) + Number(p.tradingFeeApr)) / p.leverage
    ),
  }));

  const ausdPools = response.ausdPools.map((p) => ({
    pool: `${p.key}-aUSD-pool`,
    chain: chainString,
    project: 'alpaca-finance',
    symbol: utils.formatSymbol(p.sourceName),
    tvlUsd: Number(p.tvl),
    apy: Number(p.totalApy),
  }));

  const lendingPools = response.lendingPools.map((p) => ({
    pool: `${p.ibToken.address}-${chainString}`.toLowerCase(),
    chain: chainString,
    project: 'alpaca-finance',
    symbol: utils.formatSymbol(p.symbol),
    tvlUsd: Number(p.tvl),
    apy: Number(p.totalApy),
  }));

  return [
    ...fairLaunchStakingPools,
    ...strategyPools,
    ...farmingPools,
    ...ausdPools,
    ...lendingPools,
  ];
}

const chainMapping = {
  bsc: 'binance',
  ftm: 'fantom',
};

const main = async () => {
  const [bsc, ftm] = await Promise.all([apy('bsc'), apy('ftm')]);
  return [...bsc, ...ftm];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.alpacafinance.org/farm',
};
