const Web3 = require('web3');
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

const getCakeAprs = async (chain) => {
  const poolLength = await sdk.api.abi
    .call({
      abi: abiMcV3.find((m) => m.name === 'poolLength'),
      target: MASTERCHEF_ADDRESS,
      params: chain,
    })
    .then((o) => o.output);
  const totalAllocPoint = await sdk.api.abi
    .call({
      abi: abiMcV3.find((m) => m.name === 'totalAllocPoint'),
      target: MASTERCHEF_ADDRESS,
      params: chain,
    })
    .then((o) => o.output);
  const latestPeriodCakePerSecond = await sdk.api.abi
    .call({
      abi: abiMcV3.find((m) => m.name === 'latestPeriodCakePerSecond'),
      target: MASTERCHEF_ADDRESS,
      params: chain,
    })
    .then((o) => o.output);

  const cakePerSecond = new bn(latestPeriodCakePerSecond.toString())
    .div(1e18)
    .div(1e12)
    .toString();

  const poolInfoCalls = Array.from({ length: poolLength + 1 })
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
    .then((o) => o.output);

  const { cakePrice } = await getBaseTokensPrice();

  // Here a little too complex to get the total staked liquidity in MasterChef `in-range`, can use api to get it instead?
  // https://github.com/pancakeswap/pancake-frontend/blob/develop/apps/web/src/pages/api/v3/%5BchainId%5D/farms/liquidity/%5Baddress%5D.ts
  // by lp address
  const tvls = {};

  // convert it into usd
  // by lp address
  const tvlsUSD = {};

  const cakeAPRs = poolInfos.reduce((poolInfo, cakeAprs) => {
    const v3Pool = poolInfo.v3Pool;
    const allocPoint = poolInfo.allocPoint;
    const cakeApr = cakeAPR(
      cakePerSecond,
      totalAllocPoint,
      allocPoint,
      cakeUSD,
      tvlsUSD[v3Pool]
    );
    return {
      [v3Pool.toLowerCase()]: cakeApr,
      cakeAprs,
    };
  }, {});
};

// Cake APR (global) = (cakePerSecond * 31536000) / (totalAllocPoint / pool.allocPoint) * 100 * cakeUSD / totalStakedLiquidityUSD
const cakeAPR = (
  cakePerSecond,
  totalAllocPoint,
  poolAllocPoint,
  cakeUSD,
  totalStakedLiquidityUSD
) => {
  return new bn(cakePerSecond)
    .times(31536000)
    .div(new bn(totalAllocPoint).div(poolAllocPoint))
    .times(100)
    .times(cakeUSD)
    .div(totalStakedLiquidityUSD)
    .toString();
};

const getBaseTokensPrice = async () => {
  const priceKeys = {
    cake: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  };
  const prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${Object.values(priceKeys).map(
        (t) => `bsc:${t}`
      )}`
    )
  ).coins;

  const cakePrice = prices[`bsc:${priceKeys.cake}`].price;

  return { cakePrice };
};

module.exports = {
  getCakeAprs,
};
