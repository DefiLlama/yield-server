const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');
const poolAbi = require('../aave-v3/poolAbi');

const chain = 'core';
// PoolDataProvider
const target = '0x567AF83d912C85c7a66d093e41D92676fA9076E3';

const apy = async () => {
  const reserveTokens = (
    await sdk.api.abi.call({
      target,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    })
  ).output.map((o) => o.output);

  const totalSupplyEthereum = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'totalSupply'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalancesEthereum = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'balanceOf'),
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimalsEthereum = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'decimals'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `${chain}:${t.tokenAddress}`)
    .join(',');
  const pricesEthereum = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  return reserveTokens
    .map((pool, i) => {
      const p = poolsReserveData[i];
      const price = pricesEthereum[`${chain}:${pool.tokenAddress}`]?.price;

      const supply = totalSupplyEthereum[i];
      const totalSupplyUsd =
        (supply / 10 ** underlyingDecimalsEthereum[i]) * price;

      const currentSupply = underlyingBalancesEthereum[i];
      const tvlUsd =
        (currentSupply / 10 ** underlyingDecimalsEthereum[i]) * price;

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
        ltv: poolsReservesConfigurationData[i].ltv / 10000,
        borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
      };
    })
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.colend.xyz/markets/',
};
