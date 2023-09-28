const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const project = 'alpaca-leveraged-yield-farming';

const tokenAbi = {
  inputs: [],
  name: 'token',
  outputs: [{ internalType: 'address', name: '', type: 'address' }],
  stateMutability: 'view',
  type: 'function',
};

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

  const fairLaunchStakingPools = await Promise.all(
    filteredStakingPools.map(async (p) => {
      let underlying;
      if (chain === 'ftm') {
        underlying = (
          await sdk.api.abi.call({
            target: p.stakingToken.address,
            abi: tokenAbi,
            chain: 'fantom',
          })
        ).output;
      }

      return {
        pool: `${p.stakingToken.address}-staking-${chainString}`.toLowerCase(),
        chain: chainString,
        project,
        symbol: utils.formatSymbol(p.symbol.split(' ')[0]),
        tvlUsd: Number(p.tvl),
        apy: Number(p.apy),
        underlyingTokens: chain === 'ftm' ? [underlying] : [],
      };
    })
  );

  const strategyPools = response.strategyPools.map((p) => ({
    pool: `${p.address}-${chainString}`.toLowerCase(),
    chain: chainString,
    project,
    symbol: p.workingToken.symbol.split(' ')[0],
    poolMeta: p.name,
    tvlUsd: Number(p.tvl),
    apy: Number(p.apy),
    underlyingTokens: [
      p.workingToken?.tokenA?.address,
      p.workingToken?.tokenB?.address,
    ].filter((i) => i !== undefined),
  }));

  const farmingPools = response.farmingPools.map((p) => ({
    pool: `${p.workingToken.address}-farming-${chainString}`.toLowerCase(),
    chain: chainString,
    project,
    symbol: p.sourceName.split(' ')[1],
    poolMeta: p.sourceName.split(' ')[0],
    tvlUsd: Number(p.tvl),
    apy: utils.aprToApy(
      (Number(p.farmRewardApr) + Number(p.tradingFeeApr)) / p.leverage
    ),
    underlyingTokens: [
      p.workingToken?.tokenA?.address,
      p.workingToken?.tokenB?.address,
    ].filter((i) => i !== undefined),
  }));

  const ausdPools = response.ausdPools.map((p) => ({
    pool: `${p.key}-aUSD-pool`,
    chain: chainString,
    project,
    symbol: utils.formatSymbol(p.sourceName),
    tvlUsd: Number(p.tvl),
    apy: Number(p.totalApy),
  }));

  return [
    ...fairLaunchStakingPools,
    ...strategyPools,
    ...farmingPools,
    ...ausdPools,
  ];
}

const chainMapping = {
  bsc: 'binance',
  ftm: 'fantom',
};

async function apyLending(chain) {
  const response = (
    await axios.get(
      `https://alpaca-static-api.alpacafinance.org/${chain}/v1/landing/summary.json`
    )
  ).data.data;

  const chainString = utils.formatChain(chainMapping[chain]);

  return response.lendingPools.map((p) => ({
    pool: `${p.ibToken.address}-${chainString}`.toLowerCase(),
    chain: chainString,
    project,
    symbol: utils.formatSymbol(p.symbol),
    tvlUsd: Number(p.tvl),
    apy: Number(p.totalApy),
    underlyingTokens: [p.baseToken.address],
  }));
}

const main = async () => {
  const [bsc, ftm, bscLending, ftmLending] = await Promise.all([
    apy('bsc'),
    apy('ftm'),
    apyLending('bsc'),
    apyLending('ftm'),
  ]);

  return [...bsc, ...ftm, ...bscLending, ...ftmLending];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.alpacafinance.org/farm',
};
