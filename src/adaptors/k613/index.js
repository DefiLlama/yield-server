const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('../aave-v3/poolAbi');

const PROTOCOL_DATA_PROVIDER = '0xfc87bE7f3657AAD69baDb6247A88E924D1F8bc53';
const CHAIN = 'monad';
const PROJECT = 'k613';
const APP_URL = 'https://k613.net';

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

  const poolsReserveCaps = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveCaps'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:balanceOf',
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:decimals',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
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
      const cfg = poolsReservesConfigurationData[i];
      if (cfg.isFrozen) return null;

      const price = prices[`${CHAIN}:${pool.tokenAddress}`]?.price;
      if (!price) return null;

      const p = poolsReserveData[i];
      const decimals = Number(underlyingDecimals[i]);
      const toTokenAmount = (amount) => Number(amount) / 10 ** decimals;

      const tvlUsd = toTokenAmount(underlyingBalances[i]) * price;
      const totalBorrow =
        BigInt(p.totalStableDebt) + BigInt(p.totalVariableDebt);
      const totalBorrowUsd = toTokenAmount(totalBorrow) * price;
      const totalSupplyUsd = tvlUsd + totalBorrowUsd;

      const borrowCap = Number(poolsReserveCaps[i].borrowCap);
      const borrowCapUsd = borrowCap * price;
      const availableBorrowUsd = borrowCap
        ? Math.max(Math.min(tvlUsd, borrowCapUsd - totalBorrowUsd), 0)
        : tvlUsd;

      return {
        pool: `${aTokens[i].tokenAddress}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (Number(p.liquidityRate) / 10 ** 27) * 100,
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        availableBorrowUsd,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        borrowToken: pool.tokenAddress,
        ltv: Number(cfg.ltv) / 10000,
        borrowable: cfg.borrowingEnabled,
        token: aTokens[i].tokenAddress,
      };
    })
    .filter(Boolean);

  return pools.filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy,
  url: APP_URL,
  protocolId: '7785',
};
