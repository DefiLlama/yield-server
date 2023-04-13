const abiMcV3 = require('./masterchefv3.json');
const utils = require('../utils');
const sdk = require('@defillama/sdk');
const bn = require('bignumber.js');

const MASTERCHEF_ADDRESS = '0x556B9306565093C855AEA9AE92A594704c2Cd59e';

const baseUrl = 'https://api.thegraph.com/subgraphs/name';
const chains = {
  ethereum: `${baseUrl}/pancakeswap/exchange-v3-eth`,
  bsc: `${baseUrl}/pancakeswap/exchange-v3-bsc`,
};

const chainIds = {
  ethereum: 1,
  bsc: 56,
};

const getCakeAprs = async (chain) => {
  const poolLength = await sdk.api.abi
    .call({
      abi: abiMcV3.find((m) => m.name === 'poolLength'),
      target: MASTERCHEF_ADDRESS,
      chain,
    })
    .then((o) => o.output);
  const totalAllocPoint = await sdk.api.abi
    .call({
      abi: abiMcV3.find((m) => m.name === 'totalAllocPoint'),
      target: MASTERCHEF_ADDRESS,
      chain,
    })
    .then((o) => o.output);
  const latestPeriodCakePerSecond = await sdk.api.abi
    .call({
      abi: abiMcV3.find((m) => m.name === 'latestPeriodCakePerSecond'),
      target: MASTERCHEF_ADDRESS,
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
        target: MASTERCHEF_ADDRESS,
        params: i,
      };
    });

  const poolInfos = await sdk.api.abi
    .multiCall({
      abi: abiMcV3.find((m) => m.name === 'poolInfo'),
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
        `https://farms-api.pancakeswap.com/v3/${chainIds[chain]}/liquidity/${p.v3Pool}`
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
      console.log('missing token price', token0);
      return acc;
    }
    if (!token1Price) {
      console.log('missing token price', token1);
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

  console.log(tvlsUSD, 'tvlsUSD')

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

  const prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${Object.values(priceKeys)
        .map((t) => `bsc:${t}`)
        .concat(allTokens.map((t) => `${chain}:${t}`))
        .join(',')}`
    )
  ).coins;

  const cakePrice = prices[`bsc:${priceKeys.cake}`].price;
  return { cakePrice, prices };
};

module.exports = {
  getCakeAprs,
};
