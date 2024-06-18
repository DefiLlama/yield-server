const Web3 = require('web3');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { request, gql, batchRequests } = require('graphql-request');
const superagent = require('superagent');
const { chunk } = require('lodash');

const { masterChefABI, lpTokenABI } = require('./abis');
const utils = require('../utils');

const RPC_URL = 'https://rpc.ankr.com/fantom';
const API_URL = 'https://api.thegraph.com/subgraphs/name/eerieeight/spookyswap';

const MASTERCHEF_ADDRESS = '0x18b4f774fdC7BF685daeeF66c2990b1dDd9ea6aD';
const BOO_TOKEN = '0x841FAD6EAe12c286d1Fd18d1d525DFfA75C7EFFE'.toLowerCase();

const FTM_BLOCK_TIME = 1;
const BLOCKS_PER_YEAR = Math.floor((60 / FTM_BLOCK_TIME) * 60 * 24 * 365);
const BLOCKS_PER_DAY = Math.floor((60 / FTM_BLOCK_TIME) * 60 * 24);
const WEEKS_PER_YEAR = 52;
const FEE_RATE = 0.0017;

const web3 = new Web3(RPC_URL);

const pairQuery = gql`
  query pairQuery($id_in: [ID!]) {
    pairs(where: { id_in: $id_in }) {
      id
      token0 {
        decimals
        id
        symbol
      }
      token1 {
        decimals
        id
        symbol
      }
    }
  }
`;

const getPairInfo = async (pairs) => {
  const pairInfo = await Promise.all(
    chunk(pairs, 7).map((tokens) =>
      request(API_URL, pairQuery, {
        id_in: tokens.map((pair) => pair.toLowerCase()),
      })
    )
  );

  return pairInfo
    .map(({ pairs }) => pairs)
    .flat()
    .reduce((acc, pair) => ({ ...acc, [pair.id.toLowerCase()]: pair }), {});
};

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
  tokenPrices
) => {
  const { decimals: token0Decimals, id: token0Address } = token0;
  const { decimals: token1Decimals, id: token1Address } = token1;
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

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .map((address) => `fantom:${address}`)
        .join(',')
        .toLowerCase()}`
    )
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

const apy = async () => {
  const masterChef = new web3.eth.Contract(masterChefABI, MASTERCHEF_ADDRESS);

  const poolsCount = await masterChef.methods.poolLength().call();
  const totalAllocPoint = await masterChef.methods.totalAllocPoint().call();
  const bswPerBlock = (await masterChef.methods.booPerSecond().call()) / 1e18;

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

  const tokensPrices = await getPrices([...tokens0, ...tokens1]);

  const pairsInfo = await getPairInfo(lpTokens);

  const lpChunks = chunk(lpTokens, 10);

  const pairVolumes = await Promise.all(
    lpChunks.map((lpsChunk) =>
      request(
        API_URL,
        gql`
    query volumesQuery {
      ${lpsChunk
        .slice(0, 10)
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
  `
      )
    )
  );

  const volumesMap = pairVolumes.flat().reduce(
    (acc, curChunk) => ({
      ...acc,
      ...Object.entries(curChunk).reduce(
        (innerAcc, [key, val]) => ({
          ...innerAcc,
          [key.split('_')[1]]: val,
        }),
        {}
      ),
    }),
    {}
  );

  const res = pools.map((pool, i) => {
    const poolInfo = pool;
    const reserves = reservesData[i];
    const pairInfo = pairsInfo[lpTokens[i].toLowerCase()];

    const supply = supplyData[i];
    const masterChefBalance = masterChefBalData[i];

    const masterChefReservesUsd = calculateReservesUSD(
      reserves,
      masterChefBalance / supply,
      pairInfo.token0,
      pairInfo.token1,
      tokensPrices
    )
      ?.div(1e18)
      .toString();

    const lpReservesUsd = calculateReservesUSD(
      reserves,
      1,
      pairInfo.token0,
      pairInfo.token1,
      tokensPrices
    )
      ?.div(1e18)
      .toString();

    const lpFees7D =
      (volumesMap[lpTokens[i].toLowerCase()] || []).reduce(
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
      symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
      tvlUsd:
        lpTokens[i].toLowerCase() ===
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
  timetravel: false,
  apy: apy,
  url: 'https://spooky.fi/#/farms',
};
