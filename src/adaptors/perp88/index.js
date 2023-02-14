const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const utils = require('../utils');
const abi = require('./abi');
const addresses = require('./addresses.json');

const secondsPerYear = 60 * 60 * 24 * 365;

const getPrices = async (addresses) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses,
    })
  ).body.coins;

  const pricesBySymbol = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [price.symbol.toLowerCase()]: price.price,
    }),
    {}
  );

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return { pricesByAddress, pricesBySymbol };
};

const apy = async () => {
  // 1. Find reward value per year
  // rewardValuePerYear = rewardRatePerSecond * secPerYear * usdcPrice
  const rewardRatePerSecond = (
    await sdk.api.abi.call({
      abi: abi.rewardRate,
      chain: 'polygon',
      target: addresses.PROTOCOL_REVENUE_REWARDER,
      params: [],
    })
  ).output;

  const rewardRatePerSecondBn = BigNumber(rewardRatePerSecond).dividedBy(
    BigNumber(10).exponentiatedBy(6)
  );

  const { pricesBySymbol } = await getPrices([`polygon:${addresses.USDC}`]);

  const rewardValuePerSecond = rewardRatePerSecondBn.multipliedBy(
    pricesBySymbol.usdc
  );
  const rewardValuePerYear = rewardValuePerSecond.multipliedBy(secondsPerYear);

  // 2. Find tvl under plp staking
  // tvl = aum * Plp.balanceOf(plpStaking) / plp.totalSupply()
  const [
    { output: aumE18 },
    { output: plpAmountInStaking },
    { output: plpTotalSupply },
  ] = await Promise.all([
    sdk.api.abi.call({
      abi: abi.getAumE18,
      chain: 'polygon',
      target: addresses.POOL_DIAMOND_CONTRACT,
      params: [true],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'polygon',
      target: addresses.PLP,
      params: [addresses.PLP_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.totalSupply,
      chain: 'polygon',
      target: addresses.PLP,
      params: [],
    }),
  ]);

  const aumBn = BigNumber(aumE18).dividedBy(BigNumber(10).exponentiatedBy(18));
  const plpAmountInStakingBn = BigNumber(plpAmountInStaking).dividedBy(
    BigNumber(10).exponentiatedBy(18)
  );
  const plpTotalSupplyBn = BigNumber(plpTotalSupply).dividedBy(
    BigNumber(10).exponentiatedBy(18)
  );

  const tvl = aumBn
    .multipliedBy(plpAmountInStakingBn)
    .dividedBy(plpTotalSupplyBn);

  // 3. Find apr = (rewardValuePerYear / tvl) * 100
  const apr = rewardValuePerYear.multipliedBy(100).dividedBy(tvl);

  // 4. Compose the response
  const plpStakingPool = {
    pool: `${addresses.PLP_STAKING}-polygon`,
    chain: 'Polygon',
    project: 'perp88',
    symbol: 'USDC-USDT-WBTC-ETH-MATIC',
    tvlUsd: tvl.toNumber(),
    apy: apr.toNumber(),
    rewardTokens: [addresses.USDC],
    underlyingTokens: [
      addresses.USDC,
      addresses.USDT,
      addresses.WBTC,
      addresses.WMATIC,
      addresses.WETH,
    ],
    poolMeta: 'PLP Staking',
    url: 'https://app.perp88.com/earn',
  };

  return [plpStakingPool];
};

module.exports = {
  timetravel: false,
  apy: apy,
};
