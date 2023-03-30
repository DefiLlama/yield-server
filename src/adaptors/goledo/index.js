const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const masterChefABI = require('./abis/masterchef.json');
const lpABI = require('./abis/lp.json');

const GOL_TOKEN = '0xa4B59aA3De2af57959C23E2c9c89a2fCB408Ce6A';
const MASTERCHEF_ADDRESS = '0x80161779e4d5ecbc33918ca37f7f263ddc480017';
const CONFLUX_BLOCK_TIME = 1;
const BLOCKS_PER_YEAR = Math.floor((60 / CONFLUX_BLOCK_TIME) * 60 * 24 * 365);

const getBaseTokensPrice = async () => {
  const priceKeys = ['goledo', 'conflux-token']
    .map((t) => `coingecko:${t}`)
    .join(',');

  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  const golPrice = prices['coingecko:goledo'].price;
  const cfxPrice = prices['coingecko:conflux-token'].price;

  return { cfxPrice, golPrice };
};

const getPairInfo = async (pair, tokenAddress) => {
  const tokenDecimals0 = await sdk.api.abi.call({
    abi: 'erc20:decimals',
    target: tokenAddress[0],
    chain: 'conflux',
    requery: true,
  });

  const tokenDecimals1 = await sdk.api.abi.call({
    abi: 'erc20:decimals',
    target: tokenAddress[1],
    chain: 'conflux',
    requery: true,
  });

  const tokenDecimals = [tokenDecimals0.output, tokenDecimals1.output];

  const tokenSymbol0 = await sdk.api.abi.call({
    abi: 'erc20:symbol',
    target: tokenAddress[0],
    chain: 'conflux',
    requery: true,
  });

  const tokenSymbol1 = await sdk.api.abi.call({
    abi: 'erc20:symbol',
    target: tokenAddress[1],
    chain: 'conflux',
    requery: true,
  });

  const tokenSymbol = [tokenSymbol0.output, tokenSymbol1.output];

  return {
    lpToken: pair.toLowerCase(),
    pairName: tokenSymbol.join('-'),
    token0: {
      address: tokenAddress[0],
      symbol: tokenSymbol[0],
      decimals: tokenDecimals[0],
    },
    token1: {
      address: tokenAddress[1],
      symbol: tokenSymbol[1],
      decimals: tokenDecimals[1],
    },
  };
};

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  GOLPerBlock,
  GOLPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const GOLPerYear = BLOCKS_PER_YEAR * GOLPerBlock;
  return ((poolWeight * GOLPerYear * GOLPrice) / reserveUSD) * 100;
};

const calculateReservesUSD = (
  reserves,
  reservesRatio,
  token0,
  token1,
  tokenPrices
) => {
  const { decimals: token0Decimals, address: token0Address } = token0;
  const { decimals: token1Decimals, address: token1Address } = token1;
  const token0Price = tokenPrices[0];
  const token1Price = tokenPrices[1];

  const reserve0 = new BigNumber(reserves[0]._reserve0).times(reservesRatio);
  const reserve1 = new BigNumber(reserves[0]._reserve1).times(reservesRatio);

  if (token0Price) return reserve0.times(token0Price).times(2);
  if (token1Price) return reserve1.times(token1Price).times(2);
};

const getApy = async () => {
  const poolLength = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'conflux',
    abi: masterChefABI.find((e) => e.name === 'poolLength'),
  });
  const totalAllocPoint = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'conflux',
    abi: masterChefABI.find((e) => e.name === 'totalAllocPoint'),
  });
  const GOLPerSecond = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'conflux',
    abi: masterChefABI.find((e) => e.name === 'rewardsPerSecond'),
  });
  const normalizedGOLPerBlock =
    (GOLPerSecond.output / 1e18) * CONFLUX_BLOCK_TIME;

  const poolsRes0 = await sdk.api.abi.call({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    target: MASTERCHEF_ADDRESS,
    params: '0x93d4be3c0b11fe52818cd96a5686db1e21d749ce',
    chain: 'conflux',
    requery: true,
  });

  const poolsRes = [poolsRes0];

  const pools = poolsRes;
  const lpTokens = ['0x93d4be3c0b11fe52818cd96a5686db1e21d749ce'];

  const masterChefBalancesRes0 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'balanceOf')[0],
    target: '0x93d4be3c0b11fe52818cd96a5686db1e21d749ce',
    chain: 'conflux',
    params: MASTERCHEF_ADDRESS,
    requery: true,
  });

  const masterChefBalancesRes = [masterChefBalancesRes0.output];

  const supplyRes0 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'totalSupply')[0],
    target: '0x93d4be3c0b11fe52818cd96a5686db1e21d749ce',
    chain: 'conflux',
    requery: true,
  });

  const supplyRes = [supplyRes0.output];

  const reservesRes0 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'getReserves')[0],
    target: '0x93d4be3c0b11fe52818cd96a5686db1e21d749ce',
    chain: 'conflux',
    requery: true,
  });

  const reservesRes = [reservesRes0.output];

  const underlyingToken00 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token0')[0],
    target: '0x93d4be3c0b11fe52818cd96a5686db1e21d749ce',
    chain: 'conflux',
    requery: true,
  });

  const underlyingToken0 = [underlyingToken00.output];

  const underlyingToken10 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token1')[0],
    target: '0x93d4be3c0b11fe52818cd96a5686db1e21d749ce',
    chain: 'conflux',
    requery: true,
  });

  const underlyingToken1 = [underlyingToken10.output];

  const { cfxPrice, golPrice } = await getBaseTokensPrice();

  const reservesData = reservesRes;
  const supplyData = supplyRes;
  const masterChefBalData = masterChefBalancesRes;
  const tokens0 = underlyingToken0;
  const tokens1 = underlyingToken1;

  const tokensPrices = [cfxPrice, golPrice];

  const pairInfos = await getPairInfo(lpTokens[0], [tokens0[0], tokens1[0]]);

  const poolsApy = [];

  const pairInfo = pairInfos;

  const poolInfo = pools[0].output;

  const reserves = reservesData;

  const supply = supplyData;

  const masterChefBalance = masterChefBalData;

  const masterChefReservesUsd = calculateReservesUSD(
    reserves,
    masterChefBalance / supply,
    pairInfo.token0,
    pairInfo.token1,
    tokensPrices
  )
    .div(1e18)
    .toString();

  const apy = calculateApy(
    poolInfo,
    totalAllocPoint,
    normalizedGOLPerBlock,
    tokensPrices[1],
    masterChefReservesUsd
  );

  poolsApy.push({
    pool: lpTokens[0],
    chain: utils.formatChain('conflux'),
    project: 'goledo',
    symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
    tvlUsd: Number(masterChefReservesUsd),
    apyReward: apy,
    underlyingTokens: [tokens0[0], tokens1[0]],
    rewardTokens: [GOL_TOKEN],
  });

  return poolsApy;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://www.goledo.cash/',
};
