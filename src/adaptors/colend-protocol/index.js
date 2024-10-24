const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');
const poolAbi = require('../aave-v3/poolAbi');

const chain = 'core';

// List of PoolDataProviders where you can add additional 0x addresses as needed.
const poolDataProviders = [
  '0x567AF83d912C85c7a66d093e41D92676fA9076E3', // Main market
  '0x8E43DF2503c69b090D385E36032814c73b746e3d', // LSTBTC market
  // Add more PoolDataProvider addresses here as needed
];

const fetchMarketData = async (target) => {
  const [reserveTokens, aTokens] = await Promise.all([
    sdk.api.abi.call({
      target,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    }),
    sdk.api.abi.call({
      target,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    }),
  ]).then(([reserves, atokens]) => [reserves.output, atokens.output]);

  const [poolsReserveData, poolsReservesConfigurationData, totalSupplyData, balanceData, decimalsData] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({ target, params: p.tokenAddress })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    }),
    sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({ target, params: p.tokenAddress })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'totalSupply'),
      calls: aTokens.map((t) => ({ target: t.tokenAddress })),
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'balanceOf'),
      calls: aTokens.map((t, i) => ({ target: reserveTokens[i].tokenAddress, params: [t.tokenAddress] })),
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'decimals'),
      calls: aTokens.map((t) => ({ target: t.tokenAddress })),
    }),
  ]);

  const priceKeys = reserveTokens.map((t) => `${chain}:${t.tokenAddress}`).join(',');
  const pricesEthereum = (await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)).data.coins;

  return reserveTokens.map((pool, i) => {
    const p = poolsReserveData.output[i].output;
    const price = pricesEthereum[`${chain}:${pool.tokenAddress}`]?.price;

    const supply = totalSupplyData.output[i].output;
    const totalSupplyUsd = (supply / 10 ** decimalsData.output[i].output) * price;

    const currentSupply = balanceData.output[i].output;
    const tvlUsd = (currentSupply / 10 ** decimalsData.output[i].output) * price;

    return {
      pool: `${aTokens[i].tokenAddress}-${chain}`.toLowerCase(),
      chain,
      project: 'colend-protocol',
      symbol: pool.symbol,
      tvlUsd,
      apyBase: (p.liquidityRate / 10 ** 27) * 100,
      underlyingTokens: [pool.tokenAddress],
      totalSupplyUsd,
      totalBorrowUsd: totalSupplyUsd - tvlUsd,
      apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
      ltv: poolsReservesConfigurationData.output[i].output.ltv / 10000,
      borrowable: poolsReservesConfigurationData.output[i].output.borrowingEnabled,
    };
  });
};

const apy = async () => {
  // Fetch data for all PoolDataProviders in a flexible way
  const allMarketData = await Promise.all(
    poolDataProviders.map(fetchMarketData)
  );

  // Combine results from all markets
  const combinedMarketData = allMarketData.flat();

  return combinedMarketData.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.colend.xyz/markets/',
};
