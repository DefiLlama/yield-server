const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('../aave-v3/poolAbi');

const protocolDataProviders = {
  bob: '0xfabb0fDca4348d5A40EB1BB74AEa86A1C4eAd7E2',
};

const getApy = async (market) => {
  const chain = market;

  const protocolDataProvider = protocolDataProviders[market];
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

  const poolsReserveCaps = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveCaps'),
      chain,
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
      const decimals = Number(underlyingDecimals[i]);
      const toTokenAmount = (amount) => Number(amount) / 10 ** decimals;

      const currentSupply = underlyingBalances[i];
      const tvlUsd = toTokenAmount(currentSupply) * price;

      const totalBorrow =
        BigInt(p.totalStableDebt) + BigInt(p.totalVariableDebt);
      const totalBorrowUsd = toTokenAmount(totalBorrow) * price;
      const totalSupplyUsd = tvlUsd + totalBorrowUsd;
      const borrowCapUsd = Number(poolsReserveCaps[i].borrowCap) * price;
      const availableBorrowUsd = Number(poolsReserveCaps[i].borrowCap)
        ? Math.max(Math.min(tvlUsd, borrowCapUsd - totalBorrowUsd), 0)
        : tvlUsd;

      const marketUrlParam =
        market === 'ethereum'
          ? 'mainnet'
          : market === 'avax'
          ? 'avalanche'
          : market === 'xdai'
          ? 'gnosis'
          : market === 'bsc'
          ? 'bnb'
          : market;

      const url = `https://lend.avalonfinance.xyz/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=proto_${marketUrlParam}_v3`;

      return {
        pool: `${aTokens[i].tokenAddress}-${
          market === 'avax' ? 'avalanche' : market
        }`.toLowerCase(),
        chain,
        project: 'avalon-finance',
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
    Object.keys(protocolDataProviders).map(async (market) => getApy(market))
  );

  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '4473',
  apy,
};
