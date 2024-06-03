const sdk = require('@defillama/sdk');
const axios = require('axios');

const marketPlace = '0xcd1D02fDa51CD24123e857CE94e4356D5C073b3f';
const poolAbi = require('./abis/Pool.json');
const erc5095 = require('./abis/ERC5095.json');
const { secondsInYear } = require('date-fns');

// get symbol of a principal token
async function getSymbol(pt) {
  return (
    await sdk.api.abi.call({
      target: pt,
      abi: erc5095.find((i) => i.name === 'symbol'),
      chain: 'ethereum',
    })
  ).output;
}

// get the tvl of a pt
async function getTvlPt(pt, pool) {
  const decimals = (
    await sdk.api.abi.call({
      target: pt,
      abi: erc5095.find((i) => i.name === 'decimals'),
      chain: 'ethereum',
    })
  ).output;
  const one = 10 ** decimals;
  const totalSupply = (
    await sdk.api.abi.call({
      target: pt,
      abi: erc5095.find((i) => i.name === 'totalSupply'),
      chain: 'ethereum',
    })
  ).output;
  const fyTokenValue = (
    await sdk.api.abi.call({
      target: pool,
      abi: poolAbi.find((i) => i.name === 'sellFYTokenPreview'),
      chain: 'ethereum',
      params: [one],
    })
  ).output;

  return (totalSupply * fyTokenValue) / one / one;
}

// get the tvl in the pool
async function getTvlPool(pt, pool) {
  const decimals = (
    await sdk.api.abi.call({
      target: pt,
      abi: erc5095.find((i) => i.name === 'decimals'),
      chain: 'ethereum',
    })
  ).output;
  const one = 10 ** decimals;
  // Start by getting the value of fyTokens in the pool
  const fyTokenValue = (
    await sdk.api.abi.call({
      target: pool,
      abi: poolAbi.find((i) => i.name === 'sellFYTokenPreview'),
      chain: 'ethereum',
      params: [one],
    })
  ).output;
  const virtualFyTokenBalance = (
    await sdk.api.abi.call({
      target: pool,
      abi: poolAbi.find((i) => i.name === 'getFYTokenBalance'),
      chain: 'ethereum',
    })
  ).output;
  const poolTotalSupply = (
    await sdk.api.abi.call({
      target: pool,
      abi: poolAbi.find((i) => i.name === 'totalSupply'),
      chain: 'ethereum',
    })
  ).output;
  const fyTokenTvl =
    ((virtualFyTokenBalance - poolTotalSupply) * fyTokenValue) / one / one;
  // Get the amount of underlying held by the pool (value of shares token)
  const baseTokenTvl =
    (
      await sdk.api.abi.call({
        target: pool,
        abi: poolAbi.find((i) => i.name === 'getBaseBalance'),
        chain: 'ethereum',
      })
    ).output / one;
  return baseTokenTvl + fyTokenTvl;
}

// get the base (fixed) apy of a pool
async function getBaseApy(pt, pool) {
  const decimals = (
    await sdk.api.abi.call({
      target: pt,
      abi: erc5095.find((i) => i.name === 'decimals'),
      chain: 'ethereum',
    })
  ).output;

  const one = 10 ** decimals;

  const fyTokenValue = (
    await sdk.api.abi.call({
      target: pool,
      abi: poolAbi.find((i) => i.name === 'sellFYTokenPreview'),
      chain: 'ethereum',
      params: [one],
    })
  ).output;
  const rate = one / fyTokenValue - 1;

  // calculate fixed rate over the course of a year
  const maturity = (
    await sdk.api.abi.call({
      target: pt,
      abi: erc5095.find((i) => i.name === 'maturity'),
      chain: 'ethereum',
    })
  ).output;
  const timestamp = Math.floor(Date.now() / 1000);
  const secondsToMaturity = maturity - timestamp;
  const apy = (rate * secondsInYear) / secondsToMaturity;

  return apy * 100;
}

const main = async () => {
  let data = (
    await axios.get('https://illumigate-main.swivel.exchange/v1/pools')
  )['data'];
  data = await Promise.all(
    data.map(async (p) => {
      return [
        {
          pool: p.address,
          chain: 'ethereum',
          project: 'illuminate',
          symbol: await getSymbol(p.address),
          tvlUsd: await getTvlPool(p.pt, p.address),
          apyBase: p.apy * 100,
          apyReward: 0,
          rewardTokens: [],
          underlyingTokens: [p.underlying],
          poolMeta: '',
        },
        {
          pool: p.pt,
          chain: 'ethereum',
          project: 'illuminate',
          symbol: await getSymbol(p.pt),
          tvlUsd: await getTvlPt(p.pt, p.address),
          apyBase: await getBaseApy(p.pt, p.address),
          apyReward: 0,
          rewardTokens: [],
          underlyingTokens: [p.underlying],
          poolMeta: '',
        },
      ];
    })
  );

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://illumigate-main.swivel.exchange/v1/pools',
};
