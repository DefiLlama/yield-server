const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('./poolAbi');

const protocolDataProvider = ['0x5481bf8d3946E6A3168640c1D7523eB59F055a29'];

const getApy = async (market) => {
  const chain = 'hyperliquid';

  const reserveTokens = (
    await sdk.api.abi.call({
      target: protocolDataProvider[0],
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: protocolDataProvider[0],
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider[0],
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider[0],
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReserveCaps = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider[0],
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveCaps'),
      chain,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:totalSupply',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:balanceOf',
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:decimals',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `${chain}:${t.tokenAddress}`)
    .join(',');
  const prices = (await utils.getPriceApiData(`/prices/current/${priceKeys}`)).coins;

  return reserveTokens
    .map((pool, i) => {
      const frozen = poolsReservesConfigurationData[i].isFrozen;
      if (frozen) return null;

      const p = poolsReserveData[i];
      const price = prices[`${chain}:${pool.tokenAddress}`]?.price;

      const supply = totalSupply[i];
      const totalSupplyUsd = (supply / 10 ** underlyingDecimals[i]) * price;

      const currentSupply = underlyingBalances[i];
      const tvlUsd = (currentSupply / 10 ** underlyingDecimals[i]) * price;
      const totalBorrowUsd =
        ((Number(p.totalStableDebt) + Number(p.totalVariableDebt)) /
          10 ** underlyingDecimals[i]) *
        price;
      const borrowCapUsd = Number(poolsReserveCaps[i].borrowCap) * price;
      const hasBorrowCap = Number(poolsReserveCaps[i].borrowCap) > 0;
      const availableBorrowUsd = hasBorrowCap
        ? Math.max(Math.min(tvlUsd, borrowCapUsd - totalBorrowUsd), 0)
        : tvlUsd;

      const url = `https://app.hyperlend.finance/markets/${pool.tokenAddress}`;

      return {
        pool: `${aTokens[i].tokenAddress}-${market}`.toLowerCase(),
        chain,
        project: 'hyperlend-pooled',
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
        url,
        borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
      };
    })
    .filter((i) => Boolean(i));
};

const apy = async () => {
  const pools = await Promise.allSettled(
    Object.keys(protocolDataProvider).map(async (market) => getApy(market))
  );

  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '5940',
  apy,
};
