const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const { chunk } = require('lodash');

const { masterChefABI, lpTokenABI } = require('./abis');
const utils = require('../utils');

const API_URL = sdk.graph.modifyEndpoint(
  '2D9rXpMTvAgofWngsyRE17jKr5ywrU4W3Eaa71579qkd'
);

const MASTERCHEF_ADDRESS = '0xDbc1A13490deeF9c3C12b44FE77b503c1B061739';
const BSW_TOKEN = '0x965f527d9159dce6288a2219db51fc6eef120dd1';

const BSC_BLOCK_TIME = 3;
const BLOCKS_PER_YEAR = Math.floor((60 / BSC_BLOCK_TIME) * 60 * 24 * 365);
const WEEKS_PER_YEAR = 52;
const FEE_RATE = 0.0005;
const CHAIN = 'bsc';

const apy = async () => {
  const nonLpPools = [0];

  const poolsCount = (
    await sdk.api.abi.call({
      target: MASTERCHEF_ADDRESS,
      chain: CHAIN,
      abi: masterChefABI.find((m) => m.name === 'poolLength'),
    })
  ).output;

  const totalAllocPoint = (
    await sdk.api.abi.call({
      target: MASTERCHEF_ADDRESS,
      chain: CHAIN,
      abi: masterChefABI.find((m) => m.name === 'totalAllocPoint'),
    })
  ).output;

  const bswPerBlock =
    (
      await sdk.api.abi.call({
        target: MASTERCHEF_ADDRESS,
        chain: CHAIN,
        abi: masterChefABI.find((m) => m.name === 'BSWPerBlock'),
      })
    ).output / 1e18;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolsCount)).keys()].map((i) => ({
      target: MASTERCHEF_ADDRESS,
      params: i,
    })),
    chain: 'bsc',
    requery: true,
  });

  const pools = poolsRes.output
    .map(({ output }, i) => ({ ...output, i }))
    .filter(({ i }) => !nonLpPools.includes(i));
  const lpTokens = pools.map(({ lpToken }) => lpToken);

  const [reservesData, supplyData, masterChefBalData] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      utils.makeMulticall(
        lpTokenABI.filter(({ name }) => name === method)[0],
        lpTokens,
        'bsc',
        method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null
      )
    )
  );

  const [tokens0, tokens1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      utils.makeMulticall(
        lpTokenABI.filter(({ name }) => name === method)[0],
        lpTokens,
        'bsc'
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

    if (!pairInfo) return {};

    const supply = supplyData[i];
    const masterChefBalance = masterChefBalData[i];

    const masterChefReservesUsd = utils.uniswap
      .calculateReservesUSD(
        reserves,
        masterChefBalance / supply,
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
      bswPerBlock,
      tokensPrices[BSW_TOKEN],
      masterChefReservesUsd,
      BLOCKS_PER_YEAR
    );

    return {
      pool: pool.lpToken,
      chain: utils.formatChain('binance'),
      project: 'biswap-v2',
      symbol: pairInfo.name,
      tvlUsd: Number(masterChefReservesUsd),
      apyBase,
      apyReward,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [BSW_TOKEN],
      url: `https://exchange.biswap.org/#/add/${tokens0[i]}/${tokens1[i]}`,
    };
  });

  return res.filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy,
};
