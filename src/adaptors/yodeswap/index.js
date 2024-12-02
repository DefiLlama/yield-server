const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const masterChefABI = require('./abis/masterchef.json');
const lpABI = require('./abis/lp.json');
const { chunk } = require('lodash');
const { request, gql, batchRequests } = require('graphql-request');

const YODE_TOKEN = '0x6FC4563460d5f45932C473334d5c1C5B4aEA0E01';
const MASTERCHEF_ADDRESS = '0xf7b1150cb31488bde3eB3201e0FDF1Bd54799712';
const BLOCK_TIME = 2;
const BLOCKS_PER_YEAR = Math.floor((60 / BLOCK_TIME) * 60 * 24 * 365);
const FEE_RATE = 0.001;
const WEEKS_PER_YEAR = 52;

const mapTokenDogeChaintoBSC = {
  '0x765277EebeCA2e31912C9946eAe1021199B39C61':
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
  '0xB7ddC6414bf4F5515b52D8BdD69973Ae205ff101':
    '0xba2ae424d960c26247dd6c32edc70b295c744c43', // WWDOGE
  '0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D':
    '0x55d398326f99059fF775485246999027B3197955', // usdt,
  '0x332730a4F6E03D9C55829435f10360E13cfA41Ff':
    '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // busd,
  '0xA649325Aa7C5093d12D6F98EB4378deAe68CE23F':
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // bnb
};

const mapTokenBSCtoDogeChain = {
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d':
    '0x765277EebeCA2e31912C9946eAe1021199B39C61',
  '0xba2ae424d960c26247dd6c32edc70b295c744c43':
    '0xB7ddC6414bf4F5515b52D8BdD69973Ae205ff101',
  '0x55d398326f99059ff775485246999027b3197955':
    '0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D',
  '0xe9e7cea3dedca5984780bafc599bd69add087d56':
    '0x332730a4F6E03D9C55829435f10360E13cfA41Ff',
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c':
    '0xA649325Aa7C5093d12D6F98EB4378deAe68CE23F',
};

const API_URL = 'https://graph.yodeswap.dog/subgraphs/name/yodeswap';
const pairQuery = gql`
  query pairQuery($id_in: [ID!]) {
    pairs(where: { id_in: $id_in }) {
      id
      token0 {
        symbol
        decimals
        id
      }
      token1 {
        symbol
        decimals
        id
      }
    }
  }
`;

const getPriceByReserves = (reserves) => {
  return reserves[1] / reserves[0];
};

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

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .map((address) => `bsc:${mapTokenDogeChaintoBSC[address]}`)

        .join(',')
        .toLowerCase()}`
    )
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
  couponPerSecond,
  couponPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const couponPerYear = BigNumber(couponPerSecond)
    .times(BLOCKS_PER_YEAR)
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
  const couponPerBlock = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'dogechain',
    abi: masterChefABI.find((e) => e.name === 'yodePerBlock'),
  });
  const normalizedcouponPerBlock = couponPerBlock.output / 1e18;

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
    .filter((e) => e.lpToken !== '0xB7ddC6414bf4F5515b52D8BdD69973Ae205ff101');

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
  const yodeId = 'coingecko:yodeswap';
  const yodePrice = (
    await superagent.get(`https://coins.llama.fi/prices/current/${yodeId}`)
  ).body.coins[yodeId].price;
  tokensPrices[YODE_TOKEN.toLowerCase()] = yodePrice;
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
      ...Object.entries(curChunk).reduce((innerAcc, [key, val]) => ({
        ...innerAcc,
        [key.split('_')[1]]: val,
      })),
    }),
    {}
  );

  const res = pools.map((pool, i) => {
    const poolInfo = pool;
    const reserves = reservesData[i];
    const pairInfo = pairsInfo[pool.lpToken.toLowerCase()];

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

    const lpReservesUsd = calculateReservesUSD(
      reserves,
      1,
      pairInfo.token0,
      pairInfo.token1,
      tokensPrices
    )
      .div(1e18)
      .toString();

    const lpFees7D =
      (volumesMap[pool.lpToken.toLowerCase()] || []).reduce(
        (acc, { dailyVolumeUSD }) => acc + Number(dailyVolumeUSD),
        0
      ) * FEE_RATE;
    const apyBase = ((lpFees7D * WEEKS_PER_YEAR) / lpReservesUsd) * 100;

    const apyReward = calculateApy(
      poolInfo,
      totalAllocPoint,
      normalizedcouponPerBlock,
      tokensPrices[YODE_TOKEN.toLowerCase()],
      masterChefReservesUsd
    );

    return {
      pool: pool.lpToken,
      chain: utils.formatChain('dogechain'),
      project: 'yodeswap',
      symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
      tvlUsd: Number(masterChefReservesUsd),
      apyBase,
      apyReward,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [YODE_TOKEN],
    };
  });

  return res;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://yodeswap.dog',
};
