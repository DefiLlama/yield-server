const Web3 = require('web3');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk4');
const { request, gql, batchRequests } = require('graphql-request');
const superagent = require('superagent');
const { chunk } = require('lodash');

const { zfFarmABI, zfTokenABI, erc20ABI } = require('./abis');
const utils = require('../utils');
const { TokenProvider } = require('@uniswap/smart-order-router');

const ZFFarm = '0x9f9d043fb77a194b4216784eb5985c471b979d67';
const ZFToken = '0x31c2c031fdc9d33e974f327ab0d9883eae06ca4a';

const RPC_URL = 'https://mainnet.era.zksync.io';
const API_URL = 'https://api.studio.thegraph.com/query/49271/zkswap/0.0.9';

const SECOND_PER_YEAR = 60 * 60 * 24 * 365;
const WEEKS_PER_YEAR = 52;
const FEE_RATE = 0.0004;
const CHAIN = 'era';


const web3 = new Web3(RPC_URL);

const apy = async () => {
  const nonLpPools = [0];
  const zfFarm = new web3.eth.Contract(zfFarmABI, ZFFarm);

  const poolsCount = await zfFarm.methods.poolLength().call();
  const totalAllocPoint = await zfFarm.methods.totalAllocPoint().call();
  const zfPerSecond = (await zfFarm.methods.zfPerSecond().call()) / 1e18;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: zfFarmABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolsCount)).keys()].map((i) => ({
      target: ZFFarm,
      params: i,
    })),
    chain: CHAIN,
    requery: true,
  });
  const pools = poolsRes.output
    .map(({ output }, i) => ({ ...output, i }))
    .filter(({ i }) => !nonLpPools.includes(i));

  const lpTokens = pools.map(({ lpToken }) => lpToken);

  const nonLpPoolList = poolsRes.output
    .map(({ output }, i) => ({ ...output, i }))
    .filter(({ i }) => nonLpPools.includes(i));

  const nonLpToken = nonLpPoolList.map(({ lpToken }) => lpToken);

  const [reservesData, supplyData, zfFarmBalData] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      makeMulticall(
        zfTokenABI.filter(({ name }) => name === method)[0],
        lpTokens,
        CHAIN,
        method === 'balanceOf' ? [ZFFarm] : null
      )
    )
  );
  const [tokens0, tokens1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      makeMulticall(
        zfTokenABI.filter(({ name }) => name === method)[0],
        lpTokens,
        CHAIN
      )
    )
  );

  const { pricesByAddress: tokensPrices } = await utils.getPrices(
    [...new Set([...tokens0, ...tokens1])],
    CHAIN
  );


  const pairsInfo = await utils.uniswap.getPairsInfo(lpTokens, API_URL);
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
      }`).join('\n')}
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

  const [tvl] = await
    makeMulticall(
      zfTokenABI.filter(({ name }) => name === 'balanceOf')[0],
      nonLpToken,
      CHAIN,
      [ZFFarm]
    );
  const nonLpTvl = tvl / 1e18
  const nonLpRes = nonLpPoolList.map((pool, i) => {
    const poolInfo = pool;
    const poolWeight = poolInfo.allocPoint/totalAllocPoint
    const totalRewardPricePerYear = tokensPrices[ZFToken] * poolWeight * zfPerSecond * SECOND_PER_YEAR
    const totalStakingTokenInPool = tokensPrices[ZFToken] * nonLpTvl
    const apyReward = (totalRewardPricePerYear / totalStakingTokenInPool) * 100
    return {
      pool: poolInfo.lpToken,
      chain: CHAIN,
      project: 'zkswap-finance',
      symbol: 'ZF',
      tvlUsd: totalStakingTokenInPool,
      apyBase: 0,
      apyReward,
      underlyingTokens: [poolInfo.lpToken.toLowerCase()],
      rewardTokens: [ZFToken],
      url: 'https://zkswap.finance/earn',
    };
  })

  const res = pools.map((pool, i) => {
    const poolInfo = pool;
    const reserves = reservesData[i];
    const pairInfo = pairsInfo[pool.lpToken.toLowerCase()];

    if (!pairInfo) return {};

    const supply = supplyData[i];
    const zfFarmBalance = zfFarmBalData[i];

    const zfFarmReservesUsd = utils.uniswap
      .calculateReservesUSD(
        reserves,
        zfFarmBalance / supply,
        pairInfo?.token0,
        pairInfo?.token1,
        tokensPrices
      )
      .toString();

    const lpReservesUsd = utils.uniswap
      .calculateReservesUSD(
        reserves,
        1,
        pairInfo?.token0,
        pairInfo?.token1,
        tokensPrices
      )
      .toString();

    const lpFees7D =
      (volumesMap[pool.lpToken.toLowerCase()] || []).reduce(
        (acc, { dailyVolumeUSD }) => acc + Number(dailyVolumeUSD),
        0
      ) * FEE_RATE;
    const apyBase = ((lpFees7D * WEEKS_PER_YEAR) / lpReservesUsd) * 100;

    const apyReward = utils.uniswap.calculateApy(
      poolInfo,
      totalAllocPoint,
      zfPerSecond,
      tokensPrices[ZFToken],
      zfFarmReservesUsd,
      SECOND_PER_YEAR
    );

    return {
      pool: pool.lpToken,
      chain: CHAIN,
      project: 'zkswap-finance',
      symbol: pairInfo.name,
      tvlUsd: Number(zfFarmReservesUsd),
      apyBase,
      apyReward,
      underlyingTokens: tokens0[i] && tokens1[i] ? [tokens0[i], tokens1[i]] : [poolInfo.address.toLowerCase()],
      rewardTokens: [ZFToken],
      url: 'https://zkswap.finance/earn',
    };
  });
  return [...nonLpRes, ...res];
};

const makeMulticall = async (abi, addresses, chain, params = null) => {
  const data = await sdk.api.abi.multiCall({
    abi,
    calls: addresses.map((address) => ({
      target: address,
      params,
    })),
    chain,
  });

  const res = data.output.map(({ output }) => output);

  return res;
};


module.exports = {
  timetravel: false,
  apy: apy,
};
