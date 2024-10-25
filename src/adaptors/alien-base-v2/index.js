const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const BigNumber = require('bignumber.js');
const axios = require('axios');
const utils = require('../utils');
const masterchefAbi = require('./masterchef.js');
const SUBGRAPH_URL =
  'https://api.studio.thegraph.com/query/59130/alien-base/version/latest';
const masterchef = '0x52eaecac2402633d98b95213d0b473e069d86590';
const ALB = '0x1dd2d631c92b1aCdFCDd51A0F7145A50130050C4';
const WETH = '0x4200000000000000000000000000000000000006';
const SECONDS_PER_YEAR = 31536000;

const excludedPools = [
  '0x1dd2d631c92b1aCdFCDd51A0F7145A50130050C4',
  '0x840dCB7b4d3cEb906EfD00c8b5F5c5Dd61d7f8a6',
  '0xfA52C8902519e4Da95C3C520039C676d5bD4d9a2',
  '0xcdEF05048602aA758fCa3E33B964397f904b87a9',
  '0x9D309C52abb61655610eCaE04624b81Ab1f2aEd7',
  '0xA787D1177afdEc8E03D72fFCA14Dcb1126A74887',
  '0xe95255C018c1662a20A652ec881F32bf3515017a',
  '0x7042064c6556Edbe8188C03020B21402eEdCBF0a',
  '0xDe16407Aeb41253bAC9163Fa230ceB630Be46534',
  '0x053D11735F501199EC64A125498f29eD453d27a4',
  '0x8F472e07886f03C6385072f7DE60399455a243E6',
  '0x91BE3DD3c16EE370bc26b4c6FFE2de25aBa4AB3C',
  '0x9D309C52abb61655610eCaE04624b81Ab1f2aEd7',
  '0xcdEF05048602aA758fCa3E33B964397f904b87a9',
  '0xfA52C8902519e4Da95C3C520039C676d5bD4d9a2',
  '0x6e00F103616dc8e8973920a3588b853Ce4ef011C',
  '0x8fC786FdA48A24C9EcDbf6409F9709Aa8a62d1Af',
  '0x67979Dcc55e01d799C3FbA8198f9B39E6f42Da33',
  '0x22584e946e51e41D8A0002111b1bd9d5d8406cE9',
  '0xBC33B469Fd0292B2e2B6FC037bdF27617263e91E',
  '0x7bFA42A4331aC8901c68390aA72a2e29f25A47d0',
].map((a) => a.toLowerCase());

const pairQuery = gql`
  query getPairs($first: Int!, $skip: Int!) {
    pairs(
      first: $first
      skip: $skip
      orderBy: reserveUSD
      orderDirection: desc
    ) {
      id
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      reserveUSD
      volumeUSD
      reserve0
      reserve1
      totalSupply
    }
  }
`;

const pairDayDataQuery = gql`
  query getPairDayData($pairAddresses: [String!], $startTime: Int!) {
    pairDayDatas(
      first: 7
      orderBy: date
      orderDirection: desc
      where: { pairAddress_in: $pairAddresses, date_gt: $startTime }
    ) {
      pairAddress
      dailyVolumeUSD
    }
  }
`;

const getPairs = async () => {
  const pairs = [];
  let skip = 0;
  const first = 100;

  while (true) {
    const result = await request(SUBGRAPH_URL, pairQuery, { first, skip });
    pairs.push(...result.pairs);
    if (result.pairs.length < first) break;
    skip += first;
  }

  return pairs.filter((pair) => !excludedPools.includes(pair.id.toLowerCase()));
};

const getWeeklyVolumes = async (pairs) => {
  const pairAddresses = pairs.map((pair) => pair.id.toLowerCase());
  const startTime = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  const result = await request(SUBGRAPH_URL, pairDayDataQuery, {
    pairAddresses,
    startTime,
  });

  const weeklyVolumes = {};
  const lastDayVolumes = {};
  result.pairDayDatas.forEach((dayData) => {
    if (!weeklyVolumes[dayData.pairAddress]) {
      weeklyVolumes[dayData.pairAddress] = 0;
    }
    weeklyVolumes[dayData.pairAddress] += parseFloat(dayData.dailyVolumeUSD);
    lastDayVolumes[dayData.pairAddress] = parseFloat(dayData.dailyVolumeUSD);
  });

  return { weeklyVolumes, lastDayVolumes };
};

const getMasterChefData = async () => {
  const chain = 'base';
  const totalAllocPointAbi = {
    inputs: [],
    name: 'totalAllocPoint',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };
  const albPerSecAbi = {
    inputs: [],
    name: 'albPerSec',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  const [totalAllocPoint, albPerSec] = await Promise.all([
    sdk.api.abi.call({
      target: masterchef,
      abi: totalAllocPointAbi,
      chain: chain,
    }),
    sdk.api.abi.call({
      target: masterchef,
      abi: albPerSecAbi,
      chain: chain,
    }),
  ]);

  return {
    totalAllocPoint: totalAllocPoint.output,
    albPerSec: albPerSec.output / 1e18,
  };
};

const getPoolInfo = async (pairAddresses) => {
  const chain = 'base';
  const poolLengthAbi = {
    inputs: [],
    name: 'poolLength',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };
  const poolInfoAbi = {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'poolInfo',
    outputs: [
      { internalType: 'contract IERC20', name: 'lpToken', type: 'address' },
      { internalType: 'uint256', name: 'allocPoint', type: 'uint256' },
      { internalType: 'uint256', name: 'lastRewardTime', type: 'uint256' },
      { internalType: 'uint256', name: 'accAlbPerShare', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  };

  const poolLength = await sdk.api.abi.call({
    target: masterchef,
    abi: poolLengthAbi,
    chain: chain,
  });

  const poolInfoCalls = [...Array(Number(poolLength.output)).keys()].map(
    (i) => ({
      target: masterchef,
      params: i,
    })
  );

  const poolInfos = await sdk.api.abi.multiCall({
    calls: poolInfoCalls,
    abi: poolInfoAbi,
    chain: chain,
  });

  return poolInfos.output
    .map(({ output }, i) => ({
      id: i,
      pair: { id: output.lpToken.toLowerCase() },
      allocPoint: output.allocPoint,
      lastRewardTime: output.lastRewardTime,
      accAlbPerShare: output.accAlbPerShare,
    }))
    .filter((pool) => pairAddresses.includes(pool.pair.id));
};

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  albPerSec,
  albPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint;
  const albPerYear = albPerSec * SECONDS_PER_YEAR;
  return ((poolWeight * albPerYear * albPrice) / reserveUSD) * 100;
};

const main = async (timestamp = Date.now() / 1000) => {
  const chainString = 'base';
  const pairs = await getPairs();
  const { weeklyVolumes, lastDayVolumes } = await getWeeklyVolumes(pairs);
  console.log(weeklyVolumes, lastDayVolumes);
  const poolLength = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'poolLength'),
      chain: chainString,
    })
  ).output;
  const masterChefData = await getMasterChefData();
  const poolInfo = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(poolLength)).keys()].map((i) => ({
        target: masterchef,
        params: [i],
      })),
      abi: masterchefAbi.find((m) => m.name === 'poolInfo'),
      chain: chainString,
    })
  ).output.map((o) => o.output);
  console.log(poolInfo);
  const wethPriceKey = `base:${WETH}`;
  const wethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${wethPriceKey}`)
  ).data.coins[wethPriceKey]?.price;

  const albPrice = (
    await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${ALB}`)
  ).data.pairs[0]?.priceUsd;
  const apyData = pairs
    .map((pair) => {
      const pairPoolInfo = poolInfo.find(
        (info) => info.lpToken?.toLowerCase() === pair.id.toLowerCase()
      );
      if (!pairPoolInfo || pairPoolInfo.allocPoint === '0' || !pair.id)
        return null;

      const reserveUSD = parseFloat(pair.reserveUSD);
      const apyReward = calculateApy(
        pairPoolInfo,
        masterChefData.totalAllocPoint,
        masterChefData.albPerSec,
        albPrice,
        reserveUSD
      );

      const weeklyVolumeUSD = weeklyVolumes[pair.id] || 0;
      const lastDayVolumeUSD = lastDayVolumes[pair.id] || 0;
      const feeRate = 0.0016;
      const apyBase = ((weeklyVolumeUSD * feeRate * 52) / reserveUSD) * 100;

      const isAlbStake = pair.id.toLowerCase() === ALB.toLowerCase();
      const symbol = isAlbStake
        ? pair.token0.symbol
        : `${pair.token0.symbol}-${pair.token1.symbol}`;

      const url = isAlbStake
        ? `https://app.alienbase.xyz/swap`
        : `https://app.alienbase.xyz/add/${pair.token0.id}/${pair.token1.id}`;

      return {
        pool: pair.id,
        chain: utils.formatChain('base'),
        project: 'alien-base-v2',
        symbol,
        tvlUsd: reserveUSD,
        apyBase: isAlbStake ? 0 : apyBase,
        apyReward: apyReward * 0.85,
        rewardTokens: apyReward > 0 ? [ALB] : [],
        underlyingTokens: [pair.token0.id, pair.token1.id],
        url,
      };
    })
    .filter(Boolean);

  return apyData.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
