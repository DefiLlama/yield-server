const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const { masterChefABI, lpTokenABI } = require('./abis');
const utils = require('../utils');

const API_URL = sdk.graph.modifyEndpoint(
  'HyhMfT7gehNHMBmFiExqeg3pDtop9UikjvBPfAXT3b21'
);

const MASTERCHEF_ADDRESS = '0x18b4f774fdC7BF685daeeF66c2990b1dDd9ea6aD';
const BOO_TOKEN = '0x841FAD6EAe12c286d1Fd18d1d525DFfA75C7EFFE'.toLowerCase();

const FTM_BLOCK_TIME = 1;
const BLOCKS_PER_YEAR = Math.floor((60 / FTM_BLOCK_TIME) * 60 * 24 * 365);
const WEEKS_PER_YEAR = 52;
const FEE_RATE = 0.0017;

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  bswPerBlock,
  bswPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint;
  const vvsPerYear = BLOCKS_PER_YEAR * bswPerBlock;

  return ((poolWeight * vvsPerYear * bswPrice) / reserveUSD) * 100;
};

const calculateReservesUSD = (
  reserves,
  reservesRatio,
  token0,
  token1,
  decimals0,
  decimals1,
  tokenPrices
) => {
  const token0Price = tokenPrices[token0.toLowerCase()];
  const token1Price = tokenPrices[token1.toLowerCase()];

  const reserve0 = new BigNumber(reserves._reserve0)
    .times(reservesRatio)
    .times(10 ** (18 - decimals0));
  const reserve1 = new BigNumber(reserves._reserve1)
    .times(reservesRatio)
    .times(10 ** (18 - decimals1));

  if (token0Price) return reserve0.times(token0Price).times(2);
  if (token1Price) return reserve1.times(token1Price).times(2);
};

const getPrices = async (addresses) => {
  const prices = (
    await axios.get(
      `https://coins.llama.fi/prices/current/${addresses
        .map((address) => `fantom:${address}`)
        .join(',')
        .toLowerCase()}`
    )
  ).data.coins;

  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
};

const apy = async () => {
  const poolsCount = (
    await sdk.api.abi.call({
      target: MASTERCHEF_ADDRESS,
      abi: masterChefABI.find((m) => m.name === 'poolLength'),
      chain: 'fantom',
    })
  ).output;

  const totalAllocPoint = (
    await sdk.api.abi.call({
      target: MASTERCHEF_ADDRESS,
      abi: masterChefABI.find((m) => m.name === 'totalAllocPoint'),
      chain: 'fantom',
    })
  ).output;

  const bswPerBlock =
    (
      await sdk.api.abi.call({
        target: MASTERCHEF_ADDRESS,
        abi: masterChefABI.find((m) => m.name === 'booPerSecond'),
        chain: 'fantom',
      })
    ).output / 1e18;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolsCount)).keys()].map((i) => ({
      target: MASTERCHEF_ADDRESS,
      params: i,
    })),
    chain: 'fantom',
  });

  const pools = poolsRes.output.map(({ output }, i) => ({ ...output, i }));

  const lpTokens = (
    await sdk.api.abi.multiCall({
      abi: masterChefABI.filter(({ name }) => name === 'lpToken')[0],
      calls: [...Array(Number(poolsCount)).keys()].map((i) => ({
        target: MASTERCHEF_ADDRESS,
        params: i,
      })),
      chain: 'fantom',
    })
  ).output.map(({ output }) => output);

  const [reservesRes, supplyRes, masterChefBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpTokenABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
          params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
        })),
        chain: 'fantom',
      })
    )
  );

  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpTokenABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
        })),
        chain: 'fantom',
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

  const symbols0 = (
    await sdk.api.abi.multiCall({
      calls: tokens0.map((i) => ({ target: i })),
      chain: 'fantom',
      abi: 'erc20:symbol',
    })
  ).output.map((o) => o.output);
  const symbols1 = (
    await sdk.api.abi.multiCall({
      calls: tokens1.map((i) => ({ target: i })),
      chain: 'fantom',
      abi: 'erc20:symbol',
    })
  ).output.map((o) => o.output);

  const decimals0 = (
    await sdk.api.abi.multiCall({
      calls: tokens0.map((i) => ({ target: i })),
      chain: 'fantom',
      abi: 'erc20:decimals',
    })
  ).output.map((o) => o.output);
  const decimals1 = (
    await sdk.api.abi.multiCall({
      calls: tokens1.map((i) => ({ target: i })),
      chain: 'fantom',
      abi: 'erc20:decimals',
    })
  ).output.map((o) => o.output);

  const tokensPrices = await getPrices([...tokens0, ...tokens1]);

  const queries = gql`
    query volumesQuery {
      ${lpTokens
        .map(
          (token, i) => `token_${token.toLowerCase()}:pairDayDatas(
        orderBy: date
        orderDirection: desc
        first: 7
        where: { pairAddress: "${token.toLowerCase()}" }
      ) {
        dailyVolumeUSD
      }`
        )
        .join('\n')}
      
    }
  `;

  const volumesMap = await request(API_URL, queries);

  const res = pools.map((pool, i) => {
    const poolInfo = pool;
    const reserves = reservesData[i];

    const supply = supplyData[i];
    const masterChefBalance = masterChefBalData[i];

    const masterChefReservesUsd = calculateReservesUSD(
      reserves,
      masterChefBalance / supply,
      tokens0[i],
      tokens1[i],
      decimals0[i],
      decimals1[i],
      tokensPrices
    )
      ?.div(1e18)
      .toString();

    const lpReservesUsd = calculateReservesUSD(
      reserves,
      1,
      tokens0[i],
      tokens1[i],
      decimals0[i],
      decimals1[i],
      tokensPrices
    )
      ?.div(1e18)
      .toString();

    const lpFees7D =
      (volumesMap[`token_${lpTokens[i].toLowerCase()}`] || []).reduce(
        (acc, { dailyVolumeUSD }) => acc + Number(dailyVolumeUSD),
        0
      ) * FEE_RATE;

    const apyBase = ((lpFees7D * WEEKS_PER_YEAR) / lpReservesUsd) * 100;

    const apyReward = calculateApy(
      poolInfo,
      totalAllocPoint,
      bswPerBlock,
      tokensPrices[BOO_TOKEN],
      masterChefReservesUsd
    );

    return {
      pool: lpTokens[i],
      chain: utils.formatChain('fantom'),
      project: 'spookyswap',
      symbol: `${symbols0[i]}-${symbols1[i]}`,
      tvlUsd:
        lpTokens[i]?.toLowerCase() ===
        '0xaf918ef5b9f33231764a5557881e6d3e5277d456'
          ? Number(lpReservesUsd)
          : Number(masterChefReservesUsd),
      apyBase,
      apyReward,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [BOO_TOKEN],
    };
  });

  return res.filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy,
  url: 'https://spooky.fi/#/farms',
};
