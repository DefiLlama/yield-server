const abiMcV3 = require('./masterchefv3.json');
const abiMcV3Arbitrum = require('./masterchefv3Arbitrum.json');
const abiMcV3PolygonZkevm = require('./masterchefv3PolygonZkevm.json');

const utils = require('../utils');
const sdk = require('@defillama/sdk');
const bn = require('bignumber.js');
const fetch = require('node-fetch');

const CAKE = {
  ethereum: '0x152649eA73beAb28c5b49B26eb48f7EAD6d4c898',
  bsc: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  polygon_zkevm: '0x0D1E753a25eBda689453309112904807625bEFBe2',
  era: '0x3A287a06c66f9E95a56327185cA2BDF5f031cEcD',
  arbitrum: '0x1b896893dfc86bb67Cf57767298b9073D2c1bA2c',
  base: '0x3055913c90Fcc1A6CE9a358911721eEb942013A1',
  linea: '0x0D1E753a25eBda689453309112904807625bEFBe',
  op_bnb: '0x2779106e4F4A8A28d77A24c18283651a2AE22D1C',
};

const chainIds = {
  ethereum: {
    id: 1,
    mchef: '0x556B9306565093C855AEA9AE92A594704c2Cd59e',
    abi: abiMcV3,
  },
  bsc: {
    id: 56,
    mchef: '0x556B9306565093C855AEA9AE92A594704c2Cd59e',
    abi: abiMcV3,
  },
  polygon_zkevm: {
    id: 1101,
    mchef: '0xe9c7f3196ab8c09f6616365e8873daeb207c0391',
    abi: abiMcV3PolygonZkevm,
  },
  arbitrum: {
    id: 42161,
    mchef: '0x5e09ACf80C0296740eC5d6F643005a4ef8DaA694',
    abi: abiMcV3Arbitrum,
  },
  era: {
    id: 324,
    mchef: '0x4c615E78c5fCA1Ad31e4d66eb0D8688d84307463',
    abi: abiMcV3Arbitrum,
  },
  linea: {
    id: 59144,
    mchef: '0x22E2f236065B780FA33EC8C4E58b99ebc8B55c57',
    abi: abiMcV3Arbitrum,
  },
  op_bnb: {
    id: 204,
    mchef: '0x05ddEDd07C51739d2aE21F6A9d97a8d69C2C3aaA',
    abi: abiMcV3Arbitrum,
  },
};

const getCakeAprs = async (chain) => {
  if (chainIds[chain] === undefined) return [];

  const masterChef = chainIds[chain].mchef;
  const abi = chainIds[chain].abi;

  const poolLength = await sdk.api.abi
    .call({
      abi: abi.find((m) => m.name === 'poolLength'),
      target: masterChef,
      chain,
    })
    .then((o) => o.output);
  const totalAllocPoint = await sdk.api.abi
    .call({
      abi: abi.find((m) => m.name === 'totalAllocPoint'),
      target: masterChef,
      chain,
    })
    .then((o) => o.output);
  const latestPeriodCakePerSecond = await sdk.api.abi
    .call({
      abi: abi.find((m) => m.name === 'latestPeriodCakePerSecond'),
      target: masterChef,
      chain,
    })
    .then((o) => o.output);

  const cakePerSecond = new bn(latestPeriodCakePerSecond.toString())
    .div(1e18)
    .div(1e12)
    .toString();

  const poolInfoCalls = Array.from({ length: +poolLength + 1 })
    .map((_, i) => i)
    .filter((i) => i !== 0)
    .map((i) => {
      return {
        target: masterChef,
        params: i,
      };
    });

  const poolInfos = await sdk.api.abi
    .multiCall({
      abi: abi.find((m) => m.name === 'poolInfo'),
      calls: poolInfoCalls,
      chain,
    })
    .then((o) =>
      o.output
        .map((r) => r.output)
        .filter((r) => r.allocPoint !== '0' && r.totalLiquidity !== '0')
    );

  // Getting in range token amounts staked in MasterChef v3
  // https://github.com/pancakeswap/pancake-frontend/blob/develop/apis/farms/src/v3.ts
  const allStakedTVL = await Promise.allSettled(
    poolInfos.map((p) => {
      return fetch(
        `https://farms-api.pancakeswap.com/v3/${chainIds[chain].id}/liquidity/${p.v3Pool}`
      )
        .then((r) => r.json())
        .catch((err) => {
          console.log(err);
        });
    })
  );

  // by lp address
  const tvls = {};

  for (const [index, allStakedTVLResult] of allStakedTVL.entries()) {
    if (allStakedTVLResult.status === 'fulfilled') {
      tvls[poolInfos[index].v3Pool] = allStakedTVLResult.value.formatted;
    }
  }

  const allTokens = [
    ...new Set(poolInfos.map((p) => [p.token0, p.token1]).flat()),
  ];

  const { cakePrice, prices } = await getBaseTokensPrice(allTokens, chain);

  // by lp address
  const tvlsUSD = Object.entries(tvls).reduce((acc, [lp, tvl]) => {
    const poolInfo = poolInfos.find((p) => p.v3Pool === lp);
    const token0 = poolInfo.token0;
    const token1 = poolInfo.token1;
    const token0Price = prices[`${chain}:${token0}`]?.price;
    const token1Price = prices[`${chain}:${token1}`]?.price;
    if (!token0Price) {
      console.log('missing token price', `${chain}:${token0}`);
      return acc;
    }
    if (!token1Price) {
      console.log('missing token price', `${chain}:${token1}`);
      return acc;
    }
    const token0Amount = new bn(tvl.token0);
    const token1Amount = new bn(tvl.token1);
    const tvlUSD = token0Amount
      .times(token0Price)
      .plus(token1Amount.times(token1Price));
    return {
      [lp]: tvlUSD.toString(),
      ...acc,
    };
  }, {});

  const cakeAPRs = poolInfos.reduce((cakeAprs, poolInfo) => {
    const v3Pool = poolInfo.v3Pool;
    const allocPoint = poolInfo.allocPoint;
    const cakeApr = calucCakeAPR(
      cakePerSecond,
      totalAllocPoint,
      allocPoint,
      cakePrice,
      tvlsUSD[v3Pool]
    );
    return {
      [v3Pool.toLowerCase()]: cakeApr,
      ...cakeAprs,
    };
  }, {});

  return cakeAPRs;
};

// Cake APR (global) = (cakePerSecond * 31536000) / (totalAllocPoint / pool.allocPoint) * 100 * cakeUSD / totalStakedLiquidityUSD
const calucCakeAPR = (
  cakePerSecond,
  totalAllocPoint,
  poolAllocPoint,
  cakeUSD,
  totalStakedLiquidityUSD
) => {
  if (!Number.isFinite(+totalStakedLiquidityUSD)) {
    return 0;
  }
  return new bn(cakePerSecond)
    .times(31536000)
    .div(new bn(totalAllocPoint).div(poolAllocPoint))
    .times(100)
    .times(cakeUSD)
    .div(totalStakedLiquidityUSD)
    .toNumber();
};

const getBaseTokensPrice = async (allTokens, chain) => {
  let priceKeys = {
    // only use BSC cake price for consistent
    cake: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  };

  let prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${Object.values(priceKeys)
        .map((t) => `bsc:${t}`)
        .concat(allTokens.map((t) => `${chain}:${t}`))
        .join(',')}`
    )
  ).coins;

  const cakePriceData = prices[`bsc:${priceKeys.cake}`];

  const cakeId = `${chain}:${CAKE[chain]}`;

  if (CAKE[chain] && !prices[cakeId]) {
    prices[cakeId] = cakePriceData;
  }

  return { cakePrice: cakePriceData.price, prices };
};

module.exports = {
  getCakeAprs,
  CAKE,
  chainIds,
};
