const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('./poolAbi');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const CHAIN = 'hyperliquid';
const PROTOCOL_DATA_PROVIDER = '0xa8Ca6a4A485485910aA4023b9963Dfd2f3A5aeb0';

const apy = async () => {
  const reserveTokens = (
    await sdk.api.abi.call({
      target: PROTOCOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain: CHAIN,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: PROTOCOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain: CHAIN,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const reserveTokenAddresses = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveTokensAddresses'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:totalSupply',
      calls: aTokens.map((t) => ({ target: t.tokenAddress })),
    })
  ).output.map((o) => o.output);

  const totalBorrow = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:totalSupply',
      calls: reserveTokenAddresses.map((a) => ({
        target: a.variableDebtTokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:decimals',
      calls: aTokens.map((t) => ({ target: t.tokenAddress })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `${CHAIN}:${t.tokenAddress}`)
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const pools = reserveTokens
    .map((pool, i) => {
      const frozen = poolsReservesConfigurationData[i].isFrozen;
      if (frozen) return null;

      const p = poolsReserveData[i];
      const price = prices[`${CHAIN}:${pool.tokenAddress}`]?.price;
      if (!price) return null;

      const totalSupplyUsd =
        (totalSupply[i] / 10 ** underlyingDecimals[i]) * price;
      const totalBorrowUsd =
        (totalBorrow[i] / 10 ** underlyingDecimals[i]) * price;
      const tvlUsd = totalSupplyUsd - totalBorrowUsd;

      return {
        pool: `${aTokens[i].tokenAddress}-${CHAIN}`.toLowerCase(),
        chain: CHAIN,
        project: 'purrlend',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (p.liquidityRate / 10 ** 27) * 100,
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        ltv: poolsReservesConfigurationData[i].ltv / 10000,
        url: `https://app.purrlend.io/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}`,
        borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
      };
    })
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p));

  // Merkl AAVE_SUPPLY campaigns use the aToken address as identifier,
  // so match by stripping the chain suffix from our pool id.
  return addMerklRewardApy(pools, 'purrlend', (p) => p.pool.split(`-${CHAIN}`)[0]);
};

module.exports = {
  apy,
};
