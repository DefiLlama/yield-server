const sdk = require('@defillama/sdk');
const fetch = require('node-fetch');

const utils = require('../utils');
const getPoolDepositRateAbi = {
  inputs: [],
  name: 'getDepositRate',
  outputs: [
    {
      internalType: 'uint256',
      name: '',
      type: 'uint256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const getPoolTotalSupplyAbi = {
  inputs: [],
  name: 'totalSupply',
  outputs: [
    {
      internalType: 'uint256',
      name: '',
      type: 'uint256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const getPoolBoostRateAbi = {
  inputs: [],
  name: 'rewardRate',
  outputs: [
    {
      internalType: 'uint256',
      name: '',
      type: 'uint256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const getBoostRewardTokenAbi = {
  inputs: [],
  name: 'rewardToken',
  outputs: [
    {
      internalType: 'address',
      name: '',
      type: 'address',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

// Base
const USDC_POOL_TUP_CONTRACT = '0x2Fc7641F6A569d0e678C473B95C2Fc56A88aDF75';
const AERO_POOL_TUP_CONTRACT = '0x4524D39Ca5b32527E7AF6c288Ad3E2871B9f343B';
const BTC_POOL_TUP_CONTRACT = '0xCA8C954073054551B99EDee4e1F20c3d08778329';
const ETH_POOL_TUP_CONTRACT = '0x81b0b59C7967479EC5Ce55cF6588bf314C3E4852';
const BRETT_POOL_TUP_CONTRACT = '0x6c307F792FfDA3f63D467416C9AEdfeE2DD27ECF';

const AERO_TOKEN_ADDRESS = '0x940181a94A35A4569E4529A3CDfB74e38FD98631';
const USDC_TOKEN_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BRETT_TOKEN_ADDRESS = '0x532f27101965dd16442E59d40670FaF5eBB142E4';
const BTC_TOKEN_ADDRESS = '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf';
const ETH_TOKEN_ADDRESS = '0x4200000000000000000000000000000000000006';
const DEGEN_TOKEN_ADDRESS = '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed';

const getPoolTVL = async (poolAddress, chain = 'base') => {
  return (
    await sdk.api.abi.call({
      abi: getPoolTotalSupplyAbi,
      chain: chain,
      target: poolAddress,
      params: [],
    })
  ).output;
};

const getTokenPrice = async (tokenAddress, chain = 'base') => {
  const data = await utils.getData(
    `https://coins.llama.fi/prices/current/${chain}:${tokenAddress}`
  );
  return data.coins[Object.keys(data.coins)[0]].price;
};

const getPoolDepositRate = async (poolAddress, chain = 'base') => {
  return (
    await sdk.api.abi.call({
      abi: getPoolDepositRateAbi,
      chain: chain,
      target: poolAddress,
      params: [],
    })
  ).output;
};

const getBtcPoolDepositRate = async () => {
  return (await getPoolDepositRate(BTC_POOL_TUP_CONTRACT)) / 1e16;
};

const getEthPoolDepositRate = async () => {
  return (await getPoolDepositRate(ETH_POOL_TUP_CONTRACT)) / 1e16;
};

const getUsdcPoolDepositRate = async () => {
  return (await getPoolDepositRate(USDC_POOL_TUP_CONTRACT)) / 1e16;
};

const getBrettPoolDepositRate = async () => {
  return (await getPoolDepositRate(BRETT_POOL_TUP_CONTRACT)) / 1e16;
};
const getAeroPoolDepositRate = async () => {
  return (await getPoolDepositRate(AERO_POOL_TUP_CONTRACT)) / 1e16;
};

const getBtcPoolTVL = async () => {
  const supply = await getPoolTVL(BTC_POOL_TUP_CONTRACT);

  const price = await getTokenPrice(BTC_TOKEN_ADDRESS);
  return (supply * price) / 1e8;
};

const getEthPoolTVL = async () => {
  const supply = await getPoolTVL(ETH_POOL_TUP_CONTRACT);

  const price = await getTokenPrice(ETH_TOKEN_ADDRESS);
  return (supply * price) / 1e18;
};

const getBrettPoolTVL = async () => {
  const supply = await getPoolTVL(BRETT_POOL_TUP_CONTRACT);

  const price = await getTokenPrice(BRETT_TOKEN_ADDRESS);
  return (supply * price) / 1e18;
};

const getUsdcPoolTVL = async () => {
  const supply = await getPoolTVL(USDC_POOL_TUP_CONTRACT);
  const price = await getTokenPrice(USDC_TOKEN_ADDRESS);
  return (supply * price) / 1e6;
};

const getAeroPoolTVL = async () => {
  const supply = await getPoolTVL(AERO_POOL_TUP_CONTRACT);
  const price = await getTokenPrice(AERO_TOKEN_ADDRESS);
  return (supply * price) / 1e18;
};

const getPoolsAPYs = async () => {
  const usdcPoolTvl = await getUsdcPoolTVL();
  const usdcPool = {
    pool: `dgp-${USDC_TOKEN_ADDRESS}-base`,
    chain: utils.formatChain('base'),
    project: 'degenprime',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: usdcPoolTvl,
    apyBase: await getUsdcPoolDepositRate(),
    underlyingTokens: [USDC_TOKEN_ADDRESS],
  };

  const aeroPoolTvl = await getAeroPoolTVL();
  const aeroPool = {
    pool: `dgp-${AERO_TOKEN_ADDRESS}-base`,
    chain: utils.formatChain('base'),
    project: 'degenprime',
    symbol: utils.formatSymbol('AERO'),
    tvlUsd: aeroPoolTvl,
    apyBase: await getAeroPoolDepositRate(),
    underlyingTokens: [AERO_TOKEN_ADDRESS],
  };

  const brettPoolTvl = await getBrettPoolTVL();
  const brettPool = {
    pool: `dgp-${BRETT_TOKEN_ADDRESS}-base`,
    chain: utils.formatChain('base'),
    project: 'degenprime',
    symbol: utils.formatSymbol('BRETT'),
    tvlUsd: brettPoolTvl,
    apyBase: await getBrettPoolDepositRate(),
    underlyingTokens: [BRETT_TOKEN_ADDRESS],
  };

  const btcPoolTvl = await getBtcPoolTVL();
  const btcPool = {
    pool: `dgp-${BTC_TOKEN_ADDRESS}-base`,
    chain: utils.formatChain('base'),
    project: 'degenprime',
    symbol: utils.formatSymbol('cbBTC'),
    tvlUsd: btcPoolTvl,
    apyBase: await getBtcPoolDepositRate(),
    underlyingTokens: [BTC_TOKEN_ADDRESS],
  };

  const ethPoolTvl = await getEthPoolTVL();
  const ethPool = {
    pool: `dgp-${ETH_TOKEN_ADDRESS}-base`,
    chain: utils.formatChain('base'),
    project: 'degenprime',
    symbol: utils.formatSymbol('ETH'),
    tvlUsd: ethPoolTvl,
    apyBase: await getEthPoolDepositRate(),
    underlyingTokens: [ETH_TOKEN_ADDRESS],
  };

  return [usdcPool, brettPool, aeroPool, btcPool, ethPool];
};

module.exports = {
  timetravel: false,
  start: 18007697,
  apy: getPoolsAPYs,
  url: 'https://app.degenprime.io/#/pools',
};
