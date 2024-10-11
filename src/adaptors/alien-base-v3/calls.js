const sdk = require('@defillama/sdk');
const bn = require('bignumber.js');
const fetch = require('node-fetch');

const bunniLensAbi = require('./bunniLens.json');
const v3PoolAbi = require('./v3PoolAbi.json');
const bunniHubAbi = require('./bunniHub.json');
const abiMcV3 = require('./masterchefv3.json');

const bunniLens = '0x3ceb26bb6ad94f2dfdd98f10cb4d6caf02bec9dc';
const newBunniLens = '0xf71e5E59f762B1D13e3797D24Bf0C8986A05b621';
const bunniHub = '0xdc53487e2a6ef468260bc938f645f84caaccac6f';
const newBunniHub = '0xd1Fac4F51457E4a6D35BdC7311718e5D6de92BB9';

const tokenCache = {};

const getTokenDecimals = async (tokenAddress, chain) => {
  if (tokenCache[tokenAddress]) {
    return tokenCache[tokenAddress].decimals;
  }

  const erc20Abi = [
    {
      constant: true,
      inputs: [],
      name: 'decimals',
      outputs: [{ name: '', type: 'uint8' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
  ];

  try {
    const decimals = await sdk.api.abi.call({
      abi: erc20Abi.find((m) => m.name === 'decimals'),
      target: tokenAddress,
      chain,
    });

    tokenCache[tokenAddress] = { decimals: decimals.output };

    return decimals.output;
  } catch (err) {
    console.log(`Error fetching decimals for token ${tokenAddress}:`, err);
    return 18;
  }
};

const getTokensForPool = async (poolAddress, chain) => {
  try {
    const [token0Address, token1Address] = await Promise.all([
      sdk.api.abi.call({
        abi: v3PoolAbi.find((m) => m.name === 'token0'),
        target: poolAddress,
        chain,
      }),
      sdk.api.abi.call({
        abi: v3PoolAbi.find((m) => m.name === 'token1'),
        target: poolAddress,
        chain,
      }),
    ]);

    const [token0Decimals, token1Decimals] = await Promise.all([
      getTokenDecimals(token0Address.output, chain),
      getTokenDecimals(token1Address.output, chain),
    ]);

    return {
      token0: { address: token0Address.output, decimals: token0Decimals },
      token1: { address: token1Address.output, decimals: token1Decimals },
    };
  } catch (err) {
    console.log(`Error fetching tokens for pool ${poolAddress}:`, err);
    return null;
  }
};

const getBunniVaultsForPool = async (poolAddress) => {
  const getBunniVaults = async (poolAddress) => {
    return sdk.api.abi.call({
      abi: bunniLensAbi.find((m) => m.name === 'getBunniVaults'),
      target: bunniLens,
      params: [poolAddress],
      chain: 'base',
    });
  };

  const getNewBunniVaults = async (poolAddress) => {
    return sdk.api.abi.call({
      abi: bunniLensAbi.find((m) => m.name === 'getBunniVaults'),
      target: newBunniLens,
      params: [poolAddress],
      chain: 'base',
    });
  };

  try {
    const result = await getBunniVaults(poolAddress);
    const newResult = await getNewBunniVaults(poolAddress);

    return [
      ...result.output.keys.map((vault, i) => ({
        poolAddress,
        bunniToken: result.output.tokens[i],
        tickLower: vault[1],
        tickUpper: vault[2],
        isNew: false,
      })),
      ...newResult.output.keys.map((vault, i) => ({
        poolAddress,
        bunniToken: newResult.output.tokens[i],
        tickLower: vault[1],
        tickUpper: vault[2],
        isNew: true,
      })),
    ];
  } catch (err) {
    console.log(`Error fetching bunniVaults for pool ${poolAddress}:`, err);
    return [];
  }
};

const getPricePerFullShare = async (bunniVault) => {
  try {
    const result = await sdk.api.abi.call({
      abi: bunniLensAbi.find((m) => m.name === 'pricePerFullShare'),
      target: bunniVault?.isNew ? newBunniLens : bunniLens,
      params: [
        {
          pool: bunniVault.poolAddress,
          tickLower: bunniVault.tickLower,
          tickUpper: bunniVault.tickUpper,
        },
      ],
      chain: 'base',
    });

    const liquidity = result.output.liquidity;
    const amount0 = result.output.amount0;
    const amount1 = result.output.amount1;

    return { liquidity, amount0, amount1 };
  } catch (err) {
    console.log(`Error fetching price per full share for bunniVault ${bunniVault.poolAddress}:`, err);
    return null;
  }
};

const getProtocolFee = async () => {
  try {
    const protocolFee = await sdk.api.abi.call({
      abi: bunniHubAbi.find((m) => m.name === 'protocolFee'),
      target: bunniHub,
      chain: 'base',
    });
    const newPprotocolFee = await sdk.api.abi.call({
      abi: bunniHubAbi.find((m) => m.name === 'protocolFee'),
      target: newBunniHub,
      chain: 'base',
    });
    return { protocolFee: protocolFee.output / 1e18, newProtocolFee: newPprotocolFee.output / 1e18 };
  } catch (err) {
    console.log('Error fetching protocol fee:', err);
    return 0;
  }
};

const getPoolData = async (poolAddress, chain) => {
  try {
    const slot0Call = sdk.api.abi.call({
      target: poolAddress,
      abi: v3PoolAbi.find((m) => m.name === 'slot0'),
      chain,
    });

    const feeCall = sdk.api.abi.call({
      target: poolAddress,
      abi: v3PoolAbi.find((m) => m.name === 'fee'),
      chain,
    });

    const liquidityCall = sdk.api.abi.call({
      target: poolAddress,
      abi: v3PoolAbi.find((m) => m.name === 'liquidity'),
      chain,
    });

    const [slot0Result, feeResult, liquidityResult] = await Promise.all([slot0Call, feeCall, liquidityCall]);

    const slot0 = slot0Result?.output || null;
    const fee = feeResult?.output || null;
    const liquidity = liquidityResult?.output || null;

    return {
      slot0,
      fee,
      liquidity,
    };
  } catch (err) {
    console.log(`Error fetching pool data for ${poolAddress}:`, err);
    return null;
  }
};

const getTotalSupply = async (bunniToken, chain) => {
  try {
    const totalSupply = await sdk.api.abi.call({
      abi: 'erc20:totalSupply',
      target: bunniToken,
      chain,
    });

    return totalSupply.output;
  } catch (err) {
    console.log(`Error fetching total supply for bunniToken ${bunniToken}:`, err);
    return 0;
  }
};

const getReservesForBunniVault = async (bunniVault, token0Decimals, token1Decimals) => {

    const getReserves = async (pool, tickLower, tickUpper) => {
      return sdk.api.abi.call({
        abi: bunniLensAbi.find((m) => m.name === 'getReserves'),
        target: bunniVault?.isNew ? newBunniLens : bunniLens,
        params: [{ pool, tickLower, tickUpper }],
        chain: 'base'
      });
    };
  
    try {
      const result = await getReserves(bunniVault.poolAddress, bunniVault.tickLower, bunniVault.tickUpper);
      const reserve0 = result.output.reserve0 / Math.pow(10, token0Decimals);
      const reserve1 = result.output.reserve1 / Math.pow(10, token1Decimals);
      
      return { reserve0, reserve1 };
    } catch (err) {
      console.log(`Error fetching reserves for bunniVault ${bunniVault.poolAddress}`, err);
      return null;
    }
  };

module.exports = {
  getTokenDecimals,
  getTokensForPool,
  getBunniVaultsForPool,
  getPricePerFullShare,
  getReservesForBunniVault,
  getProtocolFee,
  getPoolData,
  getTotalSupply,
};