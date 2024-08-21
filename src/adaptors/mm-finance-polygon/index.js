const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const masterChefABI = require('./abis/masterchef.json');
const lpABI = require('./abis/lp.json');

const MMF_TOKEN = '0x22a31bD4cB694433B6de19e0aCC2899E553e9481';
const MASTERCHEF_ADDRESS = '0xa2B417088D63400d211A4D5EB3C4C5363f834764';
const BLOCK_TIME = 2.3;
const BLOCKS_PER_YEAR = Math.floor((60 / BLOCK_TIME) * 60 * 24 * 365);
const WEEKS_PER_YEAR = 52;
const FEE_RATE = 0.0017;

const SUBGRAPH_URL = sdk.graph.modifyEndpoint(
  'HTJcrXUUtrVFKyNHZH99ywRx3TQm5ChSFVbn3oBiqGq6'
);
const { request, gql, batchRequests } = require('graphql-request');
const { chunk } = require('lodash');
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

const getPairInfo = async (pairs) => {
  const pairInfo = await Promise.all(
    chunk(pairs, 7).map((tokens) =>
      request(SUBGRAPH_URL, pairQuery, {
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
  const coins = addresses
    .map((address) => `polygon:${address}`)
    .join(',')
    .toLowerCase();
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${coins}`)
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

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  rewardPerBlock,
  rewardPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const rewardPerYear = BLOCKS_PER_YEAR * rewardPerBlock;
  return ((poolWeight * rewardPerYear * rewardPrice) / reserveUSD) * 100;
};

const calculateApy2 = (
  poolInfo,
  totalAllocPoint,
  rewardPerBlock,
  rewardPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const rewardPerYear = BLOCKS_PER_YEAR * (rewardPerBlock / 0.115);
  return ((poolWeight * rewardPerYear * rewardPrice) / reserveUSD) * 100;
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
    chain: 'polygon',
    abi: masterChefABI.find((e) => e.name === 'poolLength'),
  });
  const totalAllocPoint = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'polygon',
    abi: masterChefABI.find((e) => e.name === 'totalAllocPoint'),
  });
  const mmoPerBlock = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'polygon',
    abi: masterChefABI.find((e) => e.name === 'meerkatPerBlock'),
  });
  const normalizedmmoPerBlock = mmoPerBlock.output / 1e18;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolLength.output)).keys()].map((i) => ({
      target: MASTERCHEF_ADDRESS,
      params: i,
    })),
    chain: 'polygon',
    requery: true,
  });

  const pools = poolsRes.output
    .map(({ output }, i) => ({ ...output, i }))
    .filter((e) => e.allocPoint !== '0')
    .filter(
      (e) =>
        e.lpToken !== '0x22a31bD4cB694433B6de19e0aCC2899E553e9481' &&
        e.lpToken !== '0x8b6828c1Bc28Ad187A4aB05f41F2AAC547d85132' &&
        e.lpToken !== '0x0d5665A2319526A117E68E38EBEA4610aA8298F8' &&
        e.lpToken !== '0x8C9a93e198BC02ef48E8d7AEC3c042c5b00a4Ad3'
    );
  const lpTokens = pools.map(({ lpToken }) => lpToken);

  const [reservesRes, supplyRes, masterChefBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
          params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
        })),
        chain: 'polygon',
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
        chain: 'polygon',
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
  const tokensPrices = await getPrices([...tokens0, ...tokens1, MMF_TOKEN]);

  const pairsInfo = await getPairInfo(lpTokens);

  const lpChunks = chunk(lpTokens, 10);

  const pairVolumes = await Promise.all(
    lpChunks.map((lpsChunk) =>
      request(
        SUBGRAPH_URL,
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
      (volumesMap[pool.lpToken.toLowerCase()] || []).reduce(
        (acc, { dailyVolumeUSD }) => acc + Number(dailyVolumeUSD),
        0
      ) * FEE_RATE;
    const apyBase = ((lpFees7D * WEEKS_PER_YEAR) / lpReservesUsd) * 100;

    const apyReward = calculateApy(
      poolInfo,
      totalAllocPoint,
      normalizedmmoPerBlock,
      tokensPrices[MMF_TOKEN.toLowerCase()],
      masterChefReservesUsd
    );

    return {
      pool: pool.lpToken,
      chain: utils.formatChain('polygon'),
      project: 'mm-finance-polygon',
      symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
      tvlUsd: Number(masterChefReservesUsd),
      apyBase,
      apyReward,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [MMF_TOKEN],
    };
  });

  return res.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://polymm.finance/farms',
};
