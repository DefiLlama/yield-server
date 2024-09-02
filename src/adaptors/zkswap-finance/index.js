const { Web3 } = require('web3');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { request, gql, batchRequests } = require('graphql-request');
const superagent = require('superagent');
const { chunk } = require('lodash');

const {
  zfFarmABI,
  zfTokenABI,
  erc20ABI,
  zfFactory,
  zfGOVAbi,
  zfLpABI,
} = require('./abis');
const utils = require('../utils');
const { SECONDS_PER_YEAR } = require('../across/constants');

const ZFFarm = '0x9f9d043fb77a194b4216784eb5985c471b979d67';
const ZFToken = '0x31c2c031fdc9d33e974f327ab0d9883eae06ca4a';
const ZFFactory = '0x3a76e377ed58c8731f9df3a36155942438744ce3';
const ZF_GOV = '0x4ca2ac3513739cebf053b66a1d59c88d925f1987';
const DAO_START_TIME = 1697716800;

const RPC_URL = 'https://mainnet.era.zksync.io';
const API_URL = 'https://api.studio.thegraph.com/query/49271/zkswap/0.0.9';
const DAO_API_URL =
  'https://api.studio.thegraph.com/query/49271/zfgovernancestaking/0.1.2';

const SECOND_PER_DAY = 60 * 60 * 24;
const DAY_PER_YEAR = 365;
const SECOND_PER_YEAR = SECOND_PER_DAY * DAY_PER_YEAR;
const WEEKS_PER_YEAR = 52;
const CHAIN = 'era';

const web3 = new Web3(RPC_URL);

const apy = async () => {
  const nonLpPools = [0];
  const zfFarm = new web3.eth.Contract(zfFarmABI, ZFFarm);

  const zfGOV = new web3.eth.Contract(zfGOVAbi, ZF_GOV);

  const poolsCount = await zfFarm.methods.poolLength().call();
  const totalAllocPoint = Number(await zfFarm.methods.totalAllocPoint().call());
  const zfPerSecond = Number(await zfFarm.methods.zfPerSecond().call()) / 1e18;

  const protocolFeeRes = await sdk.api.abi.call({
    abi: zfFactory.find((abi) => abi.name === 'protocolFeeFactor'),
    target: ZFFactory,
    chain: CHAIN,
  });

  const protocolFee = protocolFeeRes.output;

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

  const lpTokensSwapFeeCall = await sdk.api.abi.multiCall({
    abi: zfLpABI.filter(({ name }) => name === 'getSwapFee')[0],
    calls: lpTokens.map((lpAddress) => ({
      target: lpAddress,
    })),
    chain: CHAIN,
    requery: true,
  });

  const lpTokensSwapFee = lpTokensSwapFeeCall.output.reduce(
    (lpSwapFeeObj, item, index, arr) => {
      lpSwapFeeObj[lpTokens[index]?.toLowerCase()] = item?.output;
      return lpSwapFeeObj;
    },
    {}
  );

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

  const currentTime = Math.round(new Date().getTime() / 1000);

  const daoQuery = gql`
   query daoQuery {
    transfers(
    where: {blockTimestamp_gt: ${
      currentTime - SECOND_PER_DAY * 3
    }, blockTimestamp_lte: ${currentTime}}
    first: 1000
  ) {
    value
  }}
  `;

  const { transfers } = await request(DAO_API_URL, daoQuery);

  const unstakedZFReward =
    transfers.reduce((volume, transf) => {
      return volume + Number(transf.value) / 1e18;
    }, 0) / 90;

  const pairVolumes = await Promise.all(
    lpChunks.map((lpsChunk) =>
      request(
        API_URL,
        gql`
    query volumesQuery {
      ${lpsChunk
        .slice(0, 10)
        .map(
          (token, i) =>
            `token_${token.toLowerCase()}:pairHourDatas(
                    orderBy: hourStartUnix
                    orderDirection: desc
                    first: 24
                    where: {pair_: {id: "${token.toLowerCase()}"}}) 
                    {
                        hourlyVolumeUSD
                    }`
        )
        .join('\n')}}`
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

  const [tvl] = await makeMulticall(
    zfTokenABI.filter(({ name }) => name === 'balanceOf')[0],
    nonLpToken,
    CHAIN,
    [ZFFarm]
  );
  const nonLpTvl = tvl / 1e18;
  const nonLpRes = nonLpPoolList
    .map((pool, i) => {
      const poolInfo = pool;
      const poolWeight = poolInfo.allocPoint / totalAllocPoint;
      const totalRewardPricePerYear =
        tokensPrices[ZFToken] * poolWeight * zfPerSecond * SECOND_PER_YEAR;
      const totalStakingTokenInPool = tokensPrices[ZFToken] * nonLpTvl;
      const apyReward =
        (totalRewardPricePerYear / totalStakingTokenInPool) * 100;
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
    .filter((pool) => pool.apyReward > 0);

  const unstakedZFReward3Day =
    (unstakedZFReward / 3) * DAY_PER_YEAR * tokensPrices[ZFToken];

  const { output: zfDAOPerSecondRes } = await sdk.api.abi.call({
    abi: zfGOVAbi.filter(({ name }) => name === 'zfPerSecond')[0],
    target: ZF_GOV,
    chain: CHAIN,
  });
  const zfDAOPerSecond = Number(zfDAOPerSecondRes) / 1e18;

  const { output: pendingZfRes } = await sdk.api.abi.call({
    abi: zfGOVAbi.filter(({ name }) => name === 'pendingZF')[0],
    target: ZF_GOV,
    chain: CHAIN,
  });
  const pendingZf = Number(pendingZfRes) / 1e18;

  const { output: currentGovTvlRes } = await sdk.api.abi.call({
    abi: zfGOVAbi.filter(({ name }) => name === 'balance')[0],
    target: ZF_GOV,
    chain: CHAIN,
  });
  const currentGovTvl = Number(currentGovTvlRes) / 1e18;

  const zfRewardDAOUntilNow = (currentTime - DAO_START_TIME) * zfDAOPerSecond;
  const govTvl =
    (currentGovTvl + pendingZf - zfRewardDAOUntilNow) * tokensPrices[ZFToken];
  const unstakedAPY = (unstakedZFReward3Day / govTvl) * 100;
  const govFarmAPY =
    ((zfDAOPerSecond * SECONDS_PER_YEAR * tokensPrices[ZFToken]) / govTvl) *
    100;

  const govPool = {
    pool: ZF_GOV,
    chain: CHAIN,
    project: 'zkswap-finance',
    symbol: 'ZF',
    tvlUsd: govTvl,
    apyBase: unstakedAPY,
    apyReward: govFarmAPY,
    underlyingTokens: [ZFToken],
    rewardTokens: [ZFToken],
    url: 'https://zkswap.finance/earn',
  };

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

    const fee = lpTokensSwapFee[pool.lpToken.toLowerCase()];
    const feeRate = (fee * (1 - 1 / protocolFee)) / 10000;

    const lpFees24h =
      (volumesMap[pool.lpToken.toLowerCase()] || []).reduce(
        (acc, { hourlyVolumeUSD }) => acc + Number(hourlyVolumeUSD),
        0
      ) * feeRate;

    const apyBase = ((lpFees24h * DAY_PER_YEAR) / lpReservesUsd) * 100;

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
      underlyingTokens:
        tokens0[i] && tokens1[i]
          ? [tokens0[i], tokens1[i]]
          : [poolInfo.address.toLowerCase()],
      rewardTokens: [ZFToken],
      url: 'https://zkswap.finance/earn',
    };
  });
  return [...nonLpRes, ...res, govPool];
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
