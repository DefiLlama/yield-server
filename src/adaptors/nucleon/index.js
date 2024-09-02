const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const masterChefABI = require('./abis/masterchef.json');
const lpABI = require('./abis/lp.json');

const NUT_TOKEN = '0xfe197e7968807b311d476915db585831b43a7e3b';
const MASTERCHEF_ADDRESS = '0xeced26633b5c2d7124b5eae794c9c32a8b8e7df2';
const CONFLUX_BLOCK_TIME = 1;
const BLOCKS_PER_YEAR = Math.floor((60 / CONFLUX_BLOCK_TIME) * 60 * 24 * 365);

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

const getPrices = async (addresses) => {
  const coins = addresses
    .map((address) => `conflux:${address}`)
    .join(',')
    .toLowerCase();
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${coins}`)
  ).body.coins;

  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
};

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  NUTPerBlock,
  NUTPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const NUTPerYear = BLOCKS_PER_YEAR * NUTPerBlock;
  return ((poolWeight * NUTPerYear * NUTPrice) / reserveUSD) * 100;
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
  const token0Price = tokenPrices[token0Address.toLowerCase()];
  const token1Price = tokenPrices[token1Address.toLowerCase()];

  const reserve0 = new BigNumber(reserves._reserve0)
    .times(reservesRatio)
    .times(10 ** (18 - token0Decimals));
  const reserve1 = new BigNumber(reserves._reserve1)
    .times(reservesRatio)
    .times(10 ** (18 - token1Decimals));

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
  const NUTPerSecond = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'conflux',
    abi: masterChefABI.find((e) => e.name === 'rewardsPerSecond'),
  });
  const normalizedNUTPerBlock =
    (NUTPerSecond.output / 1e18) * CONFLUX_BLOCK_TIME;

  const poolsRes0 = await sdk.api.abi.call({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    target: MASTERCHEF_ADDRESS,
    params: 0,
    chain: 'conflux',
    requery: true,
  });

  const poolsRes1 = await sdk.api.abi.call({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    target: MASTERCHEF_ADDRESS,
    params: 1,
    chain: 'conflux',
    requery: true,
  });

  const poolsRes2 = await sdk.api.abi.call({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    target: MASTERCHEF_ADDRESS,
    params: 2,
    chain: 'conflux',
    requery: true,
  });

  const poolsRes3 = await sdk.api.abi.call({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    target: MASTERCHEF_ADDRESS,
    params: 3,
    chain: 'conflux',
    requery: true,
  });

  const poolsRes4 = await sdk.api.abi.call({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    target: MASTERCHEF_ADDRESS,
    params: 4,
    chain: 'conflux',
    requery: true,
  });

  const poolsRes = [poolsRes0.output, poolsRes1.output, poolsRes2.output, poolsRes3.output, poolsRes4.output];

  const pools = poolsRes;
  const lpTokens = [
    '0xd9d5748cb36a81fe58f91844f4a0412502fd3105',
    '0x949b78ef2c8d6979098e195b08f27ff99cb20448',
    '0x2899e1bec55e7dda574e80e8ef55f17b79df2f1d',
    '0xbeebccc7420fff17d1108ec12bbce1adc15c6b6c',
    '0x413039955c96b7fc4e4aa61786de577c3d5c126b',
  ];

  const masterChefBalancesRes0 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'balanceOf')[0],
    target: '0xd9d5748cb36a81fe58f91844f4a0412502fd3105',
    chain: 'conflux',
    params: MASTERCHEF_ADDRESS,
    requery: true,
  });
  const masterChefBalancesRes1 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'balanceOf')[0],
    target: '0x949b78ef2c8d6979098e195b08f27ff99cb20448',
    chain: 'conflux',
    params: MASTERCHEF_ADDRESS,
    requery: true,
  });
  const masterChefBalancesRes2 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'balanceOf')[0],
    target: '0x2899e1bec55e7dda574e80e8ef55f17b79df2f1d',
    chain: 'conflux',
    params: MASTERCHEF_ADDRESS,
    requery: true,
  });
  const masterChefBalancesRes3 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'balanceOf')[0],
    target: '0xbeebccc7420fff17d1108ec12bbce1adc15c6b6c',
    chain: 'conflux',
    params: MASTERCHEF_ADDRESS,
    requery: true,
  });
  const masterChefBalancesRes4 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'balanceOf')[0],
    target: '0x413039955c96b7fc4e4aa61786de577c3d5c126b',
    chain: 'conflux',
    params: MASTERCHEF_ADDRESS,
    requery: true,
  });


  const masterChefBalancesRes = [
    masterChefBalancesRes0.output,
    masterChefBalancesRes1.output,
    masterChefBalancesRes2.output,
    masterChefBalancesRes3.output,
    masterChefBalancesRes4.output,
  ];

  const supplyRes0 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'totalSupply')[0],
    target: '0xd9d5748cb36a81fe58f91844f4a0412502fd3105',
    chain: 'conflux',
    requery: true,
  });
  const supplyRes1 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'totalSupply')[0],
    target: '0x949b78ef2c8d6979098e195b08f27ff99cb20448',
    chain: 'conflux',
    requery: true,
  });
  const supplyRes2 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'totalSupply')[0],
    target: '0x2899e1bec55e7dda574e80e8ef55f17b79df2f1d',
    chain: 'conflux',
    requery: true,
  });
  const supplyRes3 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'totalSupply')[0],
    target: '0xbeebccc7420fff17d1108ec12bbce1adc15c6b6c',
    chain: 'conflux',
    requery: true,
  });
  const supplyRes4 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'totalSupply')[0],
    target: '0x413039955c96b7fc4e4aa61786de577c3d5c126b',
    chain: 'conflux',
    requery: true,
  });

  const supplyRes = [supplyRes0.output, supplyRes1.output, supplyRes2.output, supplyRes3.output, supplyRes4.output];

  const reservesRes0 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'getReserves')[0],
    target: '0xd9d5748cb36a81fe58f91844f4a0412502fd3105',
    chain: 'conflux',
    requery: true,
  });
  const reservesRes1 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'getReserves')[0],
    target: '0x949b78ef2c8d6979098e195b08f27ff99cb20448',
    chain: 'conflux',
    requery: true,
  });
  const reservesRes2 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'getReserves')[0],
    target: '0x2899e1bec55e7dda574e80e8ef55f17b79df2f1d',
    chain: 'conflux',
    requery: true,
  });
  const reservesRes3 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'getReserves')[0],
    target: '0xbeebccc7420fff17d1108ec12bbce1adc15c6b6c',
    chain: 'conflux',
    requery: true,
  });
  const reservesRes4 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'getReserves')[0],
    target: '0x413039955c96b7fc4e4aa61786de577c3d5c126b',
    chain: 'conflux',
    requery: true,
  });
  const reservesRes = [
    reservesRes0.output,
    reservesRes1.output,
    reservesRes2.output,
    reservesRes3.output,
    reservesRes4.output,
  ];

  const underlyingToken00 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token0')[0],
    target: '0xd9d5748cb36a81fe58f91844f4a0412502fd3105',
    chain: 'conflux',
    requery: true,
  });
  const underlyingToken01 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token0')[0],
    target: '0x949b78ef2c8d6979098e195b08f27ff99cb20448',
    chain: 'conflux',
    requery: true,
  });
  const underlyingToken02 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token0')[0],
    target: '0x2899e1bec55e7dda574e80e8ef55f17b79df2f1d',
    chain: 'conflux',
    requery: true,
  });
  const underlyingToken03 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token0')[0],
    target: '0xbeebccc7420fff17d1108ec12bbce1adc15c6b6c',
    chain: 'conflux',
    requery: true,
  });
  const underlyingToken04 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token0')[0],
    target: '0x413039955c96b7fc4e4aa61786de577c3d5c126b',
    chain: 'conflux',
    requery: true,
  });

  const underlyingToken0 = [
    underlyingToken00.output,
    underlyingToken01.output,
    underlyingToken02.output,
    underlyingToken03.output,
    underlyingToken04.output,
  ];

  const underlyingToken10 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token1')[0],
    target: '0xd9d5748cb36a81fe58f91844f4a0412502fd3105',
    chain: 'conflux',
    requery: true,
  });
  const underlyingToken11 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token1')[0],
    target: '0x949b78ef2c8d6979098e195b08f27ff99cb20448',
    chain: 'conflux',
    requery: true,
  });
  const underlyingToken12 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token1')[0],
    target: '0x2899e1bec55e7dda574e80e8ef55f17b79df2f1d',
    chain: 'conflux',
    requery: true,
  });
  const underlyingToken13 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token1')[0],
    target: '0xbeebccc7420fff17d1108ec12bbce1adc15c6b6c',
    chain: 'conflux',
    requery: true,
  });
  const underlyingToken14 = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'token1')[0],
    target: '0x413039955c96b7fc4e4aa61786de577c3d5c126b',
    chain: 'conflux',
    requery: true,
  });

  const underlyingToken1 = [
    underlyingToken10.output,
    underlyingToken11.output,
    underlyingToken12.output,
    underlyingToken13.output,
    underlyingToken14.output,
  ];

  const reservesData = reservesRes;
  const supplyData = supplyRes;
  const masterChefBalData = masterChefBalancesRes;
  const tokens0 = underlyingToken0;
  const tokens1 = underlyingToken1;
  const tokensPrices = await getPrices([...tokens0, ...tokens1]);
  const pairInfos = await Promise.all(
    pools.map((_, index) =>
      getPairInfo(lpTokens[index], [tokens0[index], tokens1[index]])
    )
  );
  const poolsApy = [];
  for (const [i, pool] of pools.entries()) {
    const pairInfo = pairInfos[i];
    const poolInfo = pool;
    const reserves = reservesData[i];

    const supply = supplyData[i];
    const masterChefBalance = masterChefBalData[i];

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
      normalizedNUTPerBlock,
      tokensPrices[NUT_TOKEN.toLowerCase()],
      masterChefReservesUsd
    );

    poolsApy.push({
      pool: lpTokens[i],
      chain: utils.formatChain('conflux'),
      project: 'nucleon',
      symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
      tvlUsd: Number(masterChefReservesUsd),
      apyReward: apy,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [NUT_TOKEN],
    });
  }

  return poolsApy;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://www.nucleon.space/',
};
