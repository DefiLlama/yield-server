const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('./poolAbi');
const { aaveStakedTokenDataProviderAbi } = require('./abi');

const protocolDataProviders = {
  cronos_zkevm: '0x47656eb2A31094b348EBF458Eccb942d471324eD',
};

const getApy = async (chain) => {
  const protocolDataProvider = protocolDataProviders[chain];
  const reserveTokens = (
    await sdk.api.abi.call({
      target: protocolDataProvider,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: protocolDataProvider,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    })
  ).output;

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
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  return reserveTokens.map((pool, i) => {
    const p = poolsReserveData[i];
    const price = prices[`${chain}:${pool.tokenAddress}`]?.price;

    const supply = totalSupply[i];
    let totalSupplyUsd = (supply / 10 ** underlyingDecimals[i]) * price;

    const currentSupply = underlyingBalances[i];
    let tvlUsd = (currentSupply / 10 ** underlyingDecimals[i]) * price;

    totalBorrowUsd = totalSupplyUsd - tvlUsd;

    return {
      pool: `${aTokens[i].tokenAddress}-${chain}`.toLowerCase(),
      chain,
      project: 'amply-finance',
      symbol: pool.symbol,
      tvlUsd,
      apyBase: (p.liquidityRate / 10 ** 27) * 100,
      underlyingTokens: [pool.tokenAddress],
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
      ltv: poolsReservesConfigurationData[i].ltv / 10000,
      borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
    };
  });
};

const apy = async () => {
  const pools = await Promise.all(
    Object.keys(protocolDataProviders).map(async (chain) => getApy(chain))
  );

  return pools.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://amply.finance/',
};
