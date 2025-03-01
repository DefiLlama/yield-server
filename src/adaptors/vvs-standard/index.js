const { Web3 } = require('web3');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const { masterChefABI, lpTokenABI } = require('./abis');
const utils = require('../utils');

const RPC_URL = 'https://evm.cronos.org/';
const API_URL = 'https://graph.cronoslabs.com/subgraphs/name/vvs/exchange';

const MASTERCHEF_ADDRESS = '0xdccd6455ae04b03d785f12196b492b18129564bc';

const CRONOS_BLOCK_TIME = 6;
const BLOCKS_PER_YEAR = Math.floor((60 / CRONOS_BLOCK_TIME) * 60 * 24 * 365);
const BLOCKS_PER_DAY = Math.floor((60 / CRONOS_BLOCK_TIME) * 60 * 24);
const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
const FEE_RATE = 0.002;

const ARGO = '0x47a9d630dc5b28f75d3af3be3aaa982512cd89aa';
const FERRO = '0x39bc1e38c842c60775ce37566d03b41a7a66c782';

const EXTRA_REWARD_ADDRESS = {
  34: '0xb966b5d6a0fcd5b373b180bbe072bbfbbee10552',
  36: FERRO,
};

const web3 = new Web3(RPC_URL, 25);

const pairQuery = gql`
  query pairQuery($id: ID!) {
    pair(id: $id) {
      name
      id
      token0 {
        decimals
        id
      }
      token1 {
        decimals
        id
      }
    }
    pairDayDatas(
      orderBy: date
      orderDirection: desc
      where: { pairAddress: $id }
      first: 7
    ) {
      dailyVolumeUSD
    }
  }
`;

const getPairInfo = (pair) => {
  const pairInfo = request(API_URL, pairQuery, { id: pair.toLowerCase() });

  return pairInfo;
};

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  vvsPerBlock,
  vvsPrice,
  reserveUSD,
  lpApr
) => {
  const poolWeight = poolInfo.allocPoint / Number(totalAllocPoint);
  const vvsPerYear = BLOCKS_PER_YEAR * vvsPerBlock;

  return ((poolWeight * vvsPerYear * vvsPrice) / reserveUSD) * 100 + lpApr;
};

const BASE_TOKENS = [
  {
    symbol: 'WCRO',
    cgName: 'wrapped-cro',
  },
  { symbol: 'VVS', cgName: 'vvs-finance' },
];

const calculateReservesUSD = (
  pairName,
  reserves,
  reservesRatio,
  token0decimals,
  token1decimals,
  baseTokenPrices
) => {
  const [token0, token1] = pairName.split('-');
  const reserve0 = new BigNumber(reserves._reserve0)
    .times(reservesRatio)
    .times(10 ** (18 - token0decimals));
  const reserve1 = new BigNumber(reserves._reserve1)
    .times(reservesRatio)
    .times(10 ** (18 - token1decimals));

  if (token0.includes('USD')) return reserve0.times(2);
  if (token1.includes('USD')) return reserve1.times(2);

  const token0Price = baseTokenPrices[token0];
  const token1Price = baseTokenPrices[token1];

  if (token0Price) return reserve0.times(token0Price).times(2);
  if (token1Price) return reserve1.times(token1Price).times(2);
};

const getExtraRewardPoolsPerYear = async () => {
  const tokens = ['argo-finance', 'ferro']
    .map((t) => `coingecko:${t}`)
    .join(',');
  const prices = (
    await utils.getData(`https://coins.llama.fi/prices/current/${tokens}`)
  ).coins;

  const poolsRewardPerSec = {
    'argo-finance': 1.04,
    ferro: 1.929,
  };
  const poolsIds = {
    'argo-finance': 34,
    ferro: 36,
  };

  const rewardTokenAddress = {
    'argo-finance': '0xb966b5d6a0fcd5b373b180bbe072bbfbbee10552',
    ferro: FERRO,
  };

  return Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [poolsIds[name.replace('coingecko:', '')]]:
        poolsRewardPerSec[name.replace('coingecko:', '')] *
        SECONDS_PER_YEAR *
        price.price,
    }),
    {}
  );
};

const getBaseTokensPrice = async () => {
  const prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${BASE_TOKENS.map(
        ({ cgName }) => `coingecko:${cgName}`
      ).join(',')}`
    )
  ).coins;

  const pricesMap = BASE_TOKENS.reduce(
    (acc, token) => ({
      ...acc,
      [token.symbol]: prices[`coingecko:${token.cgName}`].price,
    }),
    {}
  );

  return pricesMap;
};

const main = async () => {
  const baseTokensPrices = await getBaseTokensPrice();
  const extraRewardUsd = await getExtraRewardPoolsPerYear();
  const masterChef = new web3.eth.Contract(masterChefABI, MASTERCHEF_ADDRESS);

  const poolsCount = await masterChef.methods.poolLength().call();

  const totalAllocPoint = await masterChef.methods.totalAllocPoint().call();
  const vvsPerBlock = await masterChef.methods.vvsPerBlock().call();
  const normilizedVvsPerBlock = Number(vvsPerBlock) / 1e18;
  const poolsRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolsCount)).keys()].map((i) => ({
      target: MASTERCHEF_ADDRESS,
      params: i,
    })),
    chain: 'cronos',
    requery: true,
    permitFailure: true,
  });

  const nonLpPools = [0, 23];

  const poolsInfo = poolsRes.output
    .map((res, i) => ({ ...res.output, i }))
    .filter((_, id) => !nonLpPools.includes(id))
    .filter(({ allocPoint }) => allocPoint > 0);

  const lpTokens = poolsInfo.map(({ lpToken }) => lpToken);

  const [reservesRes, supplyRes, masterChefBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpTokenABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
          params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
        })),
        chain: 'cronos',
        permitFailure: true,
        ...(method !== 'getReserves' ? { requery: true } : {}),
      })
    )
  );

  const reservesData = reservesRes.output.map((res) => res.output);
  const supplyData = supplyRes.output.map((res) => res.output);
  const masterChefBalData = masterChefBalancesRes.output.map(
    (res, i) => res.output
  );

  const pools = await Promise.all(
    poolsInfo.map((pool, i) =>
      getPairInfo(lpTokens[i]).then(
        ({ pair: pairInfo, pairDayDatas: volumeInfo }) => {
          const poolInfo = poolsInfo[i];
          const reserves = reservesData[i];
          if (!reserves) return null;

          const supply = supplyData[i];
          const masterChefBalance = masterChefBalData[i];

          const reserveUSD = calculateReservesUSD(
            pairInfo.name,
            reserves,
            masterChefBalance / supply,
            pairInfo.token0.decimals,
            pairInfo.token1.decimals,
            baseTokensPrices
          )
            ?.div(1e18)
            ?.toString();

          const lpFees7D =
            volumeInfo.reduce(
              (acc, { dailyVolumeUSD }) => acc + Number(dailyVolumeUSD),
              0
            ) * FEE_RATE;
          const apyBase = ((lpFees7D * 52) / reserveUSD) * 100;

          const extraReward = extraRewardUsd[poolInfo.i];
          const extraRewardToken = EXTRA_REWARD_ADDRESS[poolInfo.i];
          const extraApy = extraReward ? (extraReward / reserveUSD) * 100 : 0;

          const apyReward = calculateApy(
            poolInfo,
            totalAllocPoint,
            normilizedVvsPerBlock,
            baseTokensPrices['VVS'],
            reserveUSD,
            extraApy
          );

          const pool = {
            pool: pairInfo.id,
            chain: utils.formatChain('cronos'),
            project: 'vvs-standard',
            symbol: pairInfo.name,
            tvlUsd: Number(reserveUSD),
            apyBase,
            apyReward,
            underlyingTokens: [pairInfo.token0.id, pairInfo.token1.id],
            rewardTokens: extraRewardToken
              ? [
                  '0x2d03bece6747adc00e1a131bba1469c15fd11e03', // vvs
                  extraRewardToken,
                ]
              : ['0x2d03bece6747adc00e1a131bba1469c15fd11e03'],
          };
          return pool;
        }
      )
    )
  );

  // // rmv null elements
  return pools.filter(Boolean).filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://vvs.finance/farms',
};
