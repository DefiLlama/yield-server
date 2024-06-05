const sdk = require('@defillama/sdk');

const utils = require('../utils');
const controllerAbi = require('./abis/conic-controller-abi.json');
const poolAbi = require('./abis/conic-pool-abi.json');
const inflationManagerAbi = require('./abis/conic-inflation-manager-abi.json');

const BLOCKS_PER_YEAR = 2580032;

const CONTROLLER = '0x2790EC478f150a98F5D96755601a26403DF57EaE';
const INFLATION_MANAGER = '0x05F494E6554fab539873dcF92A4D2F6930105B16';
const CRV = '0xD533a949740bb3306d119CC777fa900bA034cd52';
const CVX = '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B';
const CNC = '0x9aE380F0272E2162340a5bB646c354271c0F5cFC';

const PRICE_API = 'https://coins.llama.fi/prices/current';
const CURVE_APY_API = 'https://www.convexfinance.com/api/curve-apys';
const CURVE_POOL_API = 'https://api.curve.fi/api/getPools/ethereum/main';

const deployedAtBlock = {
  '0x89dc3E9d493512F6CFb923E15369ebFddE591988': 19070154,
  '0x80a3604977270B7Ef2e637f9Eb78cE1c3FA64316': 19079209,
  '0x3367070ed152e2b715eef48D157685Cf496f3543': 19079112,
  '0x72c23c94f68669C7B6A5B6e8c87aa9B70c263140': 19564336,
  '0xb083AD0933fADF12761450a4FD45775B9Fb6Df77': 19564267,
};

const CURVE_POOL_DATA = {
  // USDC+crvUSD
  '0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E': {
    convexId: 'factory-crvusd-0',
  },
  // USDT+crvUSD
  '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4': {
    convexId: 'factory-crvusd-1',
  },
  // USDP+crvUSD
  '0xCa978A0528116DDA3cbA9ACD3e68bc6191CA53D0': {
    convexId: 'factory-crvusd-2',
  },
  // TUSD+crvUSD
  '0x34D655069F4cAc1547E4C8cA284FfFF5ad4A8db0': {
    convexId: 'factory-crvusd-3',
  },
};

const bnToNum = (bn, dec = 18) => Number(bn.toString()) / 10 ** dec;

const curvePoolId = (poolData, poolAddress) => {
  const override = CURVE_POOL_DATA[poolAddress];
  if (override) return override.convexId;
  const data = poolData.find((p) => p.address === poolAddress);
  if (!data) return null;
  return data.id;
};

const poolApy = (
  weights_,
  apyData,
  poolData,
  blockNumber_,
  deployedAtBlock_,
  exchangeRate_
) => {
  const scale = BLOCKS_PER_YEAR / (blockNumber_ - deployedAtBlock_);
  let positiveSlippageApr = (bnToNum(exchangeRate_) ** scale - 1) * 100;

  // Handle edge cases when the pool is first deployed
  if (positiveSlippageApr < 0) positiveSlippageApr = 0;

  const base =
    weights_.reduce((total, weight) => {
      const id = curvePoolId(poolData, weight.poolAddress);
      if (!id) return total;
      const apy = apyData[id];
      return apy.baseApy * bnToNum(weight.weight) + total;
    }, 0) + positiveSlippageApr;
  const crv = weights_.reduce((total, weight) => {
    const id = curvePoolId(poolData, weight.poolAddress);
    if (!id) return total;
    const apy = apyData[id];
    return apy.crvApy * bnToNum(weight.weight) + total;
  }, 0);
  return {
    base,
    crv: crv,
  };
};

const apy = async () => {
  const addresses_ = (
    await sdk.api.abi.call({
      target: CONTROLLER,
      abi: controllerAbi.find((m) => m.name === 'listPools'),
    })
  ).output;

  const inflationRate_ = (
    await sdk.api.abi.call({
      target: INFLATION_MANAGER,
      abi: inflationManagerAbi.find((m) => m.name === 'currentInflationRate'),
    })
  ).output;

  const underlying = (
    await sdk.api.abi.multiCall({
      calls: addresses_.map((i) => ({
        target: i,
      })),
      abi: poolAbi.find((m) => m.name === 'underlying'),
    })
  ).output.map((o) => o.output);

  const priceKeys = [...underlying, CNC].map((i) => `ethereum:${i}`).join(',');
  const prices = (await utils.getData(`${PRICE_API}/${priceKeys}`)).coins;

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: underlying.map((i) => ({
        target: i,
      })),
      abi: 'erc20:symbol',
    })
  ).output.map((o) => o.output);

  const decimals = (
    await sdk.api.abi.multiCall({
      calls: underlying.map((i) => ({
        target: i,
      })),
      abi: 'erc20:decimals',
    })
  ).output.map((o) => o.output);

  const totalUnderlying = (
    await sdk.api.abi.multiCall({
      calls: addresses_.map((i) => ({
        target: i,
      })),
      abi: poolAbi.find((m) => m.name === 'totalUnderlying'),
    })
  ).output.map((o) => o.output);

  const weights = (
    await sdk.api.abi.multiCall({
      calls: addresses_.map((i) => ({
        target: i,
      })),
      abi: poolAbi.find((m) => m.name === 'getWeights'),
    })
  ).output.map((o) => o.output);

  const exchangeRate = (
    await sdk.api.abi.multiCall({
      calls: addresses_.map((i) => ({
        target: i,
      })),
      abi: poolAbi.find((m) => m.name === 'exchangeRate'),
    })
  ).output.map((o) => o.output);

  const blockNumber = (await sdk.util.blocks.getBlock('ethereum')).block;

  const cncUsdPerYear =
    bnToNum(inflationRate_) * prices[`ethereum:${CNC}`].price * 365 * 86400;

  const apyData = (await utils.getData(CURVE_APY_API)).apys;
  const poolData = (await utils.getData(CURVE_POOL_API)).data.poolData;

  const pools_ = addresses_.map((address, i) => {
    const apr = poolApy(
      weights[i],
      apyData,
      poolData,
      blockNumber,
      deployedAtBlock[address],
      exchangeRate[i]
    );

    return {
      underlying: underlying[i],
      symbol: symbols[i],
      decimals: decimals[i],
      totalUnderlying: bnToNum(totalUnderlying[i], decimals[i]),
      price: prices[`ethereum:${underlying[i]}`]?.price,
      baseApy: apr.base,
      crvApy: apr.crv,
    };
  });

  const totalTvl = pools_.reduce((total, pool_) => {
    return total + pool_.totalUnderlying * pool_.price;
  }, 0);
  const cncApy = (cncUsdPerYear / totalTvl) * 100;

  return pools_.map((pool_) => {
    const tvlUsd = pool_.totalUnderlying * pool_.price;
    return {
      pool: `conic-${pool_.symbol}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'conic-finance',
      symbol: pool_.symbol === 'WETH' ? 'ETH' : pool_.symbol,
      tvlUsd,
      rewardTokens: [CNC, CRV, CVX],
      underlyingTokens: [pool_.underlying],
      apyBase: pool_.baseApy,
      apyReward: pool_.crvApy + cncApy,
    };
  });
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://conic.finance/',
};
