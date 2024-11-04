const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const masterChefABI = require('./abis/masterchef.json');
const lpABI = require('./abis/lp.json');

const ORB_TOKEN = '0x42b98a2f73a282d731b0b8f4acfb6caf3565496b';
const MASTERCHEF_ADDRESS = '0xd67a0CE4B1484DBa8dB53349F9b26a3272dB04F5';
const BSC_BLOCK_TIME = 3;
const BLOCKS_PER_YEAR = Math.floor((60 / BSC_BLOCK_TIME) * 60 * 24 * 365);
// exclude pool sigle token
const EXCLUDE = [
  '0xC446ca59C44F931Ac5b7e0F6a7424e654dB57876',
  '0x3e4BdABF4a9dAbB4438C00A61558D9AC8a965FbB',
];

const getORBPriceBUSD = async () => {
  const reservesRes = await sdk.api.abi.call({
    abi: lpABI.filter(({ name }) => name === 'getReserves')[0],
    target: '0xE1a104f204c6063B06577d8A7E6C796058494e82',
    chain: 'bsc',
  });
  return reservesRes.output._reserve1 / reservesRes.output._reserve0;
};

const getPairInfo = async (pair, tokenAddress) => {
  const [tokenSymbol, tokenDecimals] = await Promise.all(
    ['erc20:symbol', 'erc20:decimals'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: tokenAddress.map((address) => ({
          target: address,
        })),
        chain: 'bsc',
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
    .map((address) => `bsc:${address}`)
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
  ORBPerBlock,
  ORBPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const ORBPerYear = BLOCKS_PER_YEAR * ORBPerBlock;
  return ((poolWeight * ORBPerYear * ORBPrice) / reserveUSD) * 100;
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
    chain: 'bsc',
    abi: masterChefABI.find((e) => e.name === 'poolLength'),
  });
  const totalAllocPoint = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'bsc',
    abi: masterChefABI.find((e) => e.name === 'totalRegularAllocPoint'),
  });
  const ORBPerBlock = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'bsc',
    params: [true],
    abi: masterChefABI.find((e) => e.name === 'orbPerBlock'),
  });
  const normalizedORBPerBlock = ORBPerBlock.output / 1e18;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolLength.output)).keys()].map((i) => ({
      target: MASTERCHEF_ADDRESS,
      params: i,
    })),
    chain: 'bsc',
    requery: true,
  });
  const lpTokensRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'lpToken')[0],
    calls: [...Array(Number(poolLength.output)).keys()].map((i) => ({
      target: MASTERCHEF_ADDRESS,
      params: i,
    })),
    chain: 'bsc',
    requery: true,
  });

  const pools = poolsRes.output
    .map(({ output }, i) => ({ ...output, i }))
    .filter((_, index) => index > 1)
    .filter((e) => e.allocPoint !== '0');
  const lpTokens = lpTokensRes.output
    .map(({ output }) => output)
    .filter((e) => !EXCLUDE.includes(e));

  const [reservesRes, supplyRes, masterChefBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
          params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
        })),
        chain: 'bsc',
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
        chain: 'bsc',
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
  const ORBPrice = await getORBPriceBUSD();
  tokensPrices[ORB_TOKEN.toLowerCase()] = ORBPrice;
  const pairInfos = await Promise.all(
    pools.map((pool, index) =>
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
      normalizedORBPerBlock,
      ORBPrice,
      masterChefReservesUsd
    );

    poolsApy.push({
      pool: lpTokens[i],
      chain: utils.formatChain('binance'),
      project: 'orbitalswap',
      symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
      tvlUsd: Number(masterChefReservesUsd),
      apyReward: apy,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [ORB_TOKEN],
    });
  }

  return poolsApy.filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://orbitalswap.com/',
};
