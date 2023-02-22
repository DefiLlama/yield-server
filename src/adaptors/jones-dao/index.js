const sdk = require('@defillama/sdk');
const utils = require('../utils');
const axios = require('axios');
const superagent = require('superagent');

const uvrt = '0xa485a0bc44988B95245D5F20497CCaFF58a73E99';
const uvrtTracker = '0xEB23C7e19DB72F9a728fD64E1CAA459E457cfaca';
const glpTracker = '0x13C6Bed5Aa16823Aba5bBA691CAeC63788b19D9d';
const usdc = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
const strategy = '0x8e53d1B71bf7c6487cFF5156257a687c8704cd31';
const glp = '0x1aDDD80E6039594eE970E5872D247bf0414C8903';

async function tvljUSDC() {
  const collateralBalance = await sdk.api.abi.call({
    abi: 'erc20:balanceOf',
    target: uvrt,
    params: [uvrtTracker],
    chain: 'arbitrum',
  });

  const key = `arbitrum:${uvrt}`;
  let priceUsd = await axios.get(
    `https://coins.llama.fi/prices/current/${key}`
  );
  priceUsd = priceUsd.data.coins[key].price;

  let tvl = (Number(collateralBalance.output) / 1e18) * priceUsd;

  return tvl;
}

async function tvljGLP() {
  const collateralBalance = await sdk.api.abi.call({
    abi: 'erc20:balanceOf',
    target: glp,
    params: [strategy],
    chain: 'arbitrum',
  });

  const key = `arbitrum:${glp}`;
  let priceUsd = await axios.get(
    `https://coins.llama.fi/prices/current/${key}`
  );
  priceUsd = priceUsd.data.coins[key].price;

  let tvl = (Number(collateralBalance.output) / 1e18) * priceUsd;

  return tvl;
}

async function pools() {
  let apy7d = await axios.get('https://api.jonesdao.io/api/v1/jones/apy-jusdc');
  apy7d = apy7d.data.jusdcApy.week;

  let apyInception = await axios.get(
    'https://api.jonesdao.io/api/v1/jones/apy-jusdc'
  );
  apyInception = apyInception.data.jusdcApy.full;

  let apy7djGLP = await axios.get(
    'https://api.jonesdao.io/api/v1/jones/apy-jglp'
  );
  apy7djGLP = apy7djGLP.data.jglpApy.week;

  let apyInceptionjGLP = await axios.get(
    'https://api.jonesdao.io/api/v1/jones/apy-jglp'
  );
  apyInceptionjGLP = apyInceptionjGLP.data.jglpApy.full;

  let tvlU = await tvljUSDC();
  let tvlG = await tvljGLP();

  // 0.97% see https://docs.jonesdao.io/jones-dao/features/incentives
  const jusdcFee = 1 - 0.97 / 100;
  const jglpFee = 1 - 3 / 100;

  const jUsdcPool = {
    pool: `${uvrtTracker}`,
    chain: 'arbitrum',
    project: 'jones-dao',
    symbol: 'jUSDC',
    apyBase: apy7d * jusdcFee,
    apyBaseInception: apyInception,
    tvlUsd: Number(tvlU),
    underlyingTokens: [usdc],
    poolMeta: '1day lock',
  };

  const jGlpPool = {
    chain: 'arbitrum',
    project: 'jones-dao',
    symbol: 'jGLP',
    underlyingTokens: [glp],
    pool: glpTracker,
    tvlUsd: Number(tvlG),
    apyBase: apy7djGLP * jglpFee,
    apyBaseInception: apyInceptionjGLP,
  };

  return [jUsdcPool, jGlpPool];
}

module.exports = {
  timetravel: false,
  url: 'https://app.jonesdao.io/vaults',
  apy: pools,
};
