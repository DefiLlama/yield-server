const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');
const poolAbi = require('../aave-v3/poolAbi');

const chain = 'bsc';
// PoolDataProvider
const target = '0x09Ddc4AE826601b0F9671b9edffDf75e7E6f5D61';

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

  const poolsReserveCaps = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveCaps'),
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
  const pricesEthereum = (await utils.getPriceApiData(`/prices/current/${priceKeys}`)).coins;

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
      const totalBorrowUsd =
        ((Number(p.totalStableDebt) + Number(p.totalVariableDebt)) /
          10 ** underlyingDecimalsEthereum[i]) *
        price;
      const borrowCapUsd = Number(poolsReserveCaps[i].borrowCap) * price;
      const availableBorrowUsd = Number(poolsReserveCaps[i].borrowCap)
        ? Math.max(Math.min(tvlUsd, borrowCapUsd - totalBorrowUsd), 0)
        : tvlUsd;

      return {
        pool: `${aTokens[i].tokenAddress}-${chain}`.toLowerCase(),
        chain,
        project: 'kinza-finance',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (p.liquidityRate / 10 ** 27) * 100,
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        availableBorrowUsd,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        borrowToken: pool.tokenAddress,
        ltv: poolsReservesConfigurationData[i].ltv / 10000,
        borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
      };
    })
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '3171',
  timetravel: false,
  apy,
  url: 'https://app.kinza.finance/',
};
