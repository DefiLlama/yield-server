const ADDRESSES = require('../assets.json')
const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const masterChefABI = require('./abis/masterchef.json');
const lpABI = require('./abis/lp.json');

const DogiumToken = '0x55bd2a3904c09547c3a5899704f1207ee61878be';
const DogiumUSDCLP = '0x6E08Bcb7c2289E6Aa0BD17d0dDED2D788ab2e8D5';
const MASTERCHEF_ADDRESS = '0x579BACCd9DdF3D9e652174c0714DBC0CD4700dF2';
const BLOCK_TIME = 2;
const SECOND_IN_YEAR = 86400 * 365;

const mapTokenDogeChaintoBSC = {
  [ADDRESSES.shiden.ETH]:
    ADDRESSES.bsc.USDC, // USDC
  [ADDRESSES.dogechain.WWDOGE]:
    '0xba2ae424d960c26247dd6c32edc70b295c744c43', // WWDOGE
  [ADDRESSES.moonriver.USDC]:
    ADDRESSES.bsc.USDT, // usdt,
  [ADDRESSES.dogechain.BUSD]:
    ADDRESSES.bsc.BUSD, // busd,
  '0xA649325Aa7C5093d12D6F98EB4378deAe68CE23F':
    ADDRESSES.bsc.WBNB, // bnb
};

const mapTokenBSCtoDogeChain = {
  [ADDRESSES.bsc.USDC]:
    ADDRESSES.shiden.ETH,
  '0xba2ae424d960c26247dd6c32edc70b295c744c43':
    ADDRESSES.dogechain.WWDOGE,
  [ADDRESSES.bsc.USDT]:
    ADDRESSES.moonriver.USDC,
  [ADDRESSES.bsc.BUSD]:
    ADDRESSES.dogechain.BUSD,
  [ADDRESSES.bsc.WBNB]:
    '0xA649325Aa7C5093d12D6F98EB4378deAe68CE23F',
};

const EXCLUDE = [
  '0x55BD2a3904C09547c3A5899704f1207eE61878Be',
  ADDRESSES.dogechain.WWDOGE,
  ADDRESSES.moonriver.USDC,
  ADDRESSES.shiden.ETH,
  ADDRESSES.dogechain.DC,
  ADDRESSES.moonriver.USDT,
];

const getPriceByReserves = async (lpAddress) => {
  const reserves = await sdk.api.abi.call({
    target: lpAddress,
    chain: 'dogechain',
    abi: lpABI.find((e) => e.name === 'getReserves'),
  });
  return reserves.output[1] / reserves.output[0];
};

const getPairInfo = async (pair, tokenAddress) => {
  const [tokenSymbol, tokenDecimals] = await Promise.all(
    ['erc20:symbol', 'erc20:decimals'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: tokenAddress.map((address) => ({
          target: address,
        })),
        chain: 'dogechain',
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
    .map((address) => `bsc:${mapTokenDogeChaintoBSC[address]}`)
    .join(',')
    .toLowerCase();

  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${coins}`)
  ).body.coins;
  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [mapTokenBSCtoDogeChain[address.split(':')[1]].toLowerCase()]:
        price.price,
    }),
    {}
  );

  return pricesObj;
};

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  dogiumPerSecond,
  dogiumPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const dogiumPerYear = BigNumber(dogiumPerSecond)
    .times(SECOND_IN_YEAR)
    .times(poolWeight);
  const apy = dogiumPerYear.times(dogiumPrice).div(reserveUSD).times(100);
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
    chain: 'dogechain',
    abi: masterChefABI.find((e) => e.name === 'poolLength'),
  });
  const totalAllocPoint = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'dogechain',
    abi: masterChefABI.find((e) => e.name === 'totalAllocPoint'),
  });
  const dogiumPerBlock = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'dogechain',
    abi: masterChefABI.find((e) => e.name === 'dogiumPerSecond'),
  });
  const normalizeddogiumPerBlock = dogiumPerBlock.output / 1e18;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolLength.output)).keys()].map((i) => ({
      target: MASTERCHEF_ADDRESS,
      params: i,
    })),
    chain: 'dogechain',
    requery: true,
  });

  const pools = poolsRes.output
    .map(({ output }, i) => ({ ...output, i }))
    .filter((e) => e.allocPoint !== '0')
    .filter((k) => !EXCLUDE.includes(k.lpToken));

  const lpTokens = pools.map(({ lpToken }) => lpToken);
  const [reservesRes, supplyRes, masterChefBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
          params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
        })),
        chain: 'dogechain',
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
        chain: 'dogechain',
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
  const pairInfos = await Promise.all(
    pools.map((_, index) =>
      getPairInfo(lpTokens[index], [tokens0[index], tokens1[index]])
    )
  );

  const gogium = await getPriceByReserves(DogiumUSDCLP);
  tokensPrices[DogiumToken.toLowerCase()] = gogium * 10 ** 12;

  const res = pools.map((pool, i) => {
    const poolInfo = pool;
    const reserves = reservesData[i];
    const pairInfo = pairInfos[i];

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

    const apyReward = calculateApy(
      poolInfo,
      totalAllocPoint,
      normalizeddogiumPerBlock,
      tokensPrices[DogiumToken.toLowerCase()],
      masterChefReservesUsd
    );

    return {
      pool: pool.lpToken + '-dogechain',
      chain: utils.formatChain('dogechain'),
      project: 'dogium-farm',
      symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
      tvlUsd: Number(masterChefReservesUsd),
      apyReward,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [DogiumToken],
    };
  });

  return res.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://lithium.dog/',
};
