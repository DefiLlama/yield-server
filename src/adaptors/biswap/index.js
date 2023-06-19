const Web3 = require('web3');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { request, gql, batchRequests } = require('graphql-request');
const superagent = require('superagent');
const { chunk } = require('lodash');

const { masterChefABI, lpTokenABI } = require('./abis');
const utils = require('../utils');
const { TokenProvider } = require('@uniswap/smart-order-router');

const RPC_URL = 'https://bsc-dataseed1.binance.org/';
const API_URL = 'https://api.thegraph.com/subgraphs/name/biswapcom/exchange5';

const MASTERCHEF_ADDRESS = '0xDbc1A13490deeF9c3C12b44FE77b503c1B061739';
const BSW_TOKEN = '0x965f527d9159dce6288a2219db51fc6eef120dd1';

const BSC_BLOCK_TIME = 3;
const BLOCKS_PER_YEAR = Math.floor((60 / BSC_BLOCK_TIME) * 60 * 24 * 365);
const BLOCKS_PER_DAY = Math.floor((60 / BSC_BLOCK_TIME) * 60 * 24);
const WEEKS_PER_YEAR = 52;
const FEE_RATE = 0.0005;
const CHAIN = 'bsc';

const web3 = new Web3(RPC_URL);

const apy = async () => {
  const nonLpPools = [0];
  const masterChef = new web3.eth.Contract(masterChefABI, MASTERCHEF_ADDRESS);

  const poolsCount = await masterChef.methods.poolLength().call();
  const totalAllocPoint = await masterChef.methods.totalAllocPoint().call();
  const bswPerBlock = (await masterChef.methods.BSWPerBlock().call()) / 1e18;

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

    const supply = supplyData[i];
    const masterChefBalance = masterChefBalData[i];

    const masterChefReservesUsd = utils.uniswap
      .calculateReservesUSD(
        reserves,
        masterChefBalance / supply,
        pairInfo.token0,
        pairInfo.token1,
        tokensPrices
      )
      .toString();

    const lpReservesUsd = utils.uniswap
      .calculateReservesUSD(
        reserves,
        1,
        pairInfo.token0,
        pairInfo.token1,
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
      project: 'biswap',
      symbol: pairInfo.name,
      tvlUsd: Number(masterChefReservesUsd),
      apyBase,
      apyReward,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [BSW_TOKEN],
      url: `https://exchange.biswap.org/#/add/${tokens0[i]}/${tokens1[i]}`,
    };
  });

  return res;
};

module.exports = {
  timetravel: false,
  apy: apy,
};
