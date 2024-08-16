const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const masterChefABI = require('./abis/masterchef.json');
const lpABI = require('./abis/lp.json');

const COUPON_TOKEN = '0xbC09220a8e461880DBE5517ecF53bC1b12cAa05D';
const REI_TOKEN = '0x7539595ebdA66096e8913a24Cc3C8c0ba1Ec79a0';
const MASTERCHEF_ADDRESS = '0x7aaA2A556578541067BFE93EE05B962Ee57E21CB';
const BNB_REI_ADDRESS = '0xf8aB4aaf70cef3F3659d3F466E35Dc7ea10d4A5d';
const BLOCK_TIME = 3;
const BLOCKS_PER_YEAR = Math.floor((60 / BLOCK_TIME) * 60 * 24 * 365);
const SECOND_IN_YEAR = 86400 * 365;

const mapTokenREItoBSC = {
  '0xf8aB4aaf70cef3F3659d3F466E35Dc7ea10d4A5d':
    '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // BNB
  '0xDD2bb4e845Bd97580020d8F9F58Ec95Bf549c3D9':
    '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
};

const mapTokenBSCtoREI = {
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c':
    '0xf8aB4aaf70cef3F3659d3F466E35Dc7ea10d4A5d',
  '0xe9e7cea3dedca5984780bafc599bd69add087d56':
    '0xDD2bb4e845Bd97580020d8F9F58Ec95Bf549c3D9',
};

const getPriceFromReservesRateBNBBsc = (reserves, bnbPrice) => {
  return (reserves[1] / reserves[0]) * bnbPrice;
};

const getPairInfo = async (pair, tokenAddress) => {
  const [tokenSymbol, tokenDecimals] = await Promise.all(
    ['erc20:symbol', 'erc20:decimals'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: tokenAddress.map((address) => ({
          target: address,
        })),
        chain: 'reichain',
        requery: true,
      })
    )
  );
  return {
    lpToken: pair.toLowerCase(),
    pairName: tokenSymbol.output.map((e) => e.output).join('-'),
    token0: {
      address: tokenAddress[0],
      symbol: tokenSymbol.output[0].output,
      decimals: tokenDecimals.output[0].output,
    },
    token1: {
      address: tokenAddress[1],
      symbol: tokenSymbol.output[1].output,
      decimals: tokenDecimals.output[1].output,
    },
  };
};

const getPrices = async (addresses) => {
  const coins = addresses
    .map((address) => `bsc:${mapTokenREItoBSC[address]}`)
    .join(',')
    .toLowerCase();
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${coins}`)
  ).body.coins;
  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [mapTokenBSCtoREI[address.split(':')[1]].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
};

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  couponPerSecond,
  couponPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const couponPerYear = BigNumber(couponPerSecond)
    .times(SECOND_IN_YEAR)
    .times(poolWeight);
  const apy = couponPerYear.times(couponPrice).div(reserveUSD).times(100);
  return apy.toNumber();
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
    chain: 'reichain',
    abi: masterChefABI.find((e) => e.name === 'poolLength'),
  });
  const totalAllocPoint = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'reichain',
    abi: masterChefABI.find((e) => e.name === 'totalAllocPoint'),
  });
  const couponPerBlock = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'reichain',
    abi: masterChefABI.find((e) => e.name === 'couponPerSecond'),
  });
  const normalizedcouponPerBlock = couponPerBlock.output / 1e18;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolLength.output)).keys()].map((i) => ({
      target: MASTERCHEF_ADDRESS,
      params: i,
    })),
    chain: 'reichain',
    requery: true,
  });

  const pools = poolsRes.output
    .map(({ output }, i) => ({ ...output, i }))
    .filter((e) => e.allocPoint !== '0')
    .filter((e) => e.lpToken !== '0xbC09220a8e461880DBE5517ecF53bC1b12cAa05D');

  const lpTokens = pools.map(({ lpToken }) => lpToken);
  const [reservesRes, supplyRes, masterChefBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
          params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
        })),
        chain: 'reichain',
        requery: true,
      })
    )
  );

  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
        })),
        chain: 'reichain',
        requery: true,
      })
    )
  );

  const reservesData = reservesRes.output.map((res) => res.output);
  const supplyData = supplyRes.output.map((res) => res.output);
  const masterChefBalData = masterChefBalancesRes.output.map(
    (res, i) => res.output
  );
  const tokens0 = underlyingToken0.output.map((res) => res.output);
  const tokens1 = underlyingToken1.output.map((res) => res.output);
  const tokensPrices = await getPrices([...tokens0, ...tokens1]);
  const reiPrice = await getPriceFromReservesRateBNBBsc(
    reservesData[2],
    tokensPrices[BNB_REI_ADDRESS.toLowerCase()]
  );
  const couponPrice = await getPriceFromReservesRateBNBBsc(
    reservesData[2],
    reiPrice
  );
  tokensPrices[REI_TOKEN.toLowerCase()] = reiPrice;
  tokensPrices[COUPON_TOKEN.toLowerCase()] = couponPrice / 10;
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
      normalizedcouponPerBlock,
      tokensPrices[COUPON_TOKEN.toLowerCase()],
      masterChefReservesUsd
    );

    poolsApy.push({
      pool: pool.lpToken,
      chain: utils.formatChain('reichain'),
      project: 'foodcourt',
      symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
      tvlUsd: Number(masterChefReservesUsd),
      apy,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [COUPON_TOKEN],
    });
  }

  return poolsApy;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://foodcourt.finance/',
};
