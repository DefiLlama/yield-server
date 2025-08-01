const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const poolAbi = require('./poolAbi');

const protocolDataProviders = {
  unit0: '0x99118c1Ca7D0DC824719E740d4b4721009a267d6',
};

const getApy = async (market) => {
  const chain = market;

  const protocolDataProvider = protocolDataProviders[market];

  // 1. Get a list of all pool tokens
  const reserveTokens = (
    await sdk.api.abi.call({
      target: protocolDataProvider,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

  // 2. Get a list of all uTokens
  const uTokens = (
    await sdk.api.abi.call({
      target: protocolDataProvider,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    })
  ).output;

  // 3. Reserve data
  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  // 4. Configuration data (ltv, borrowingEnabled)
  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    })
  ).output.map((o) => o.output);

  // 5. Total supply for uTokens
  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:totalSupply',
      calls: uTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  // 6. uTokens underlying token balance (TVL)
  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:balanceOf',
      calls: uTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  // 7. Get decimals
  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:decimals',
      calls: uTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  // 8. Get token prices via DefiLlama price API
  const priceKeys = reserveTokens
    .map((t) => `${chain}:${t.tokenAddress}`)
    .join(',');

  const prices = (await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)).data.coins;

  // 9. Forming final pools
  return reserveTokens
    .map((pool, i) => {
      const frozen = poolsReservesConfigurationData[i].isFrozen;
      if (frozen) return null;

      const p = poolsReserveData[i];
      const price = prices[`${chain}:${pool.tokenAddress}`]?.price || 0;

      const supply = totalSupply[i];
      const totalSupplyUsd = (supply / 10 ** underlyingDecimals[i]) * price;

      const currentSupply = underlyingBalances[i];
      const tvlUsd = (currentSupply / 10 ** underlyingDecimals[i]) * price;

      const totalBorrowUsd = totalSupplyUsd - tvlUsd;

      return {
        pool: `${uTokens[i].tokenAddress}-${market}`.toLowerCase(),
        chain,
        project: 'unilend-protocol',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (p.liquidityRate / 1e27) * 100,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        ltv: poolsReservesConfigurationData[i].ltv / 10000,
        borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
        url: `https://unilend.io/reserves/${pool.tokenAddress.toLowerCase()}`,
      };
    })
    .filter((i) => Boolean(i));
};

const apy = async () => {
  const pools = await getApy('unit0');
  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy,
};
