const sdk = require('@defillama/sdk');
const { utils: ethersUtils } = require('ethers');
const utils = require('../utils');

const PROJECT = 'hyperliquid-earn';
const CHAIN = 'hyperliquid';
const INFO_API = 'https://api.hyperliquid.xyz/info';
const APP_URL = 'https://app.hyperliquid.xyz/earn';
const RESERVE_STATE = '0x0000000000000000000000000000000000000812';
const TOKEN_INFO = '0x000000000000000000000000000000000000080c';
const RESERVE_TYPE =
  'tuple(uint64 borrowYearlyRateBps, uint64 supplyYearlyRateBps, uint64 balance, uint64 utilizationBps, uint64 oraclePx, uint64 ltvBps, uint64 totalSupplied, uint64 totalBorrowed)';
const TOKEN_TYPE =
  'tuple(string name, uint64[] spots, uint64 deployerTradingFeeShare, address deployer, address evmContract, uint8 szDecimals, uint8 weiDecimals, int8 evmExtraWeiDecimals)';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const UNDERLYING_OVERRIDES = {
  0: '0xb88339CB7199b77E23DB6E890353E22632Ba630f',
  150: ZERO_ADDRESS,
};

const coder = ethersUtils.defaultAbiCoder;

const readPrecompile = async (provider, target, type, token) => {
  const result = await provider.call({
    to: target,
    data: coder.encode(['uint64'], [token]),
  });
  return coder.decode([type], result)[0];
};

const readReserve = async (provider, index) => {
  const [state, info] = await Promise.all([
    readPrecompile(provider, RESERVE_STATE, RESERVE_TYPE, index),
    readPrecompile(provider, TOKEN_INFO, TOKEN_TYPE, index),
  ]);
  const scale = 10 ** info.weiDecimals;
  const evmContract =
    info.evmContract === ZERO_ADDRESS ? undefined : info.evmContract;
  return {
    index,
    symbol: info.name,
    underlying: UNDERLYING_OVERRIDES[index] ?? evmContract,
    oraclePrice: Number(state.oraclePx) / 10 ** (8 - info.szDecimals),
    totalSupplied: Number(state.totalSupplied) / scale,
    totalBorrowed: Number(state.totalBorrowed) / scale,
    supplyRate: Number(state.supplyYearlyRateBps) / 100,
    borrowRate: Number(state.borrowYearlyRateBps) / 100,
    ltv: Number(state.ltvBps) / 1e4,
  };
};

const main = async () => {
  const reserveStates = await utils.withRetry(() =>
    utils.getData(INFO_API, { type: 'allBorrowLendReserveStates' })
  );
  const provider = sdk.getProvider(CHAIN);

  const reserves = (
    await Promise.all(
      reserveStates.map(([index]) =>
        readReserve(provider, index).catch((e) => {
          console.error(`${PROJECT}: reserve ${index} read failed`, e.message);
          return null;
        })
      )
    )
  ).filter(Boolean);

  const prices = await utils.getPriceApiCoins(
    reserves
      .filter((r) => r.underlying)
      .map((r) => `${CHAIN}:${r.underlying.toLowerCase()}`)
  );

  return reserves
    .map((r) => {
      const price =
        prices[`${CHAIN}:${r.underlying?.toLowerCase()}`]?.price ??
        r.oraclePrice;
      const totalSupplyUsd = Math.max(0, r.totalSupplied * price);
      const totalBorrowUsd = Math.max(0, r.totalBorrowed * price);
      // HyperCore reserves with positive LTV are collateral-only.
      const borrowable = r.ltv === 0;

      return {
        pool: `${r.index}-hyperliquid-earn`,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: r.symbol,
        tvlUsd: Math.max(0, totalSupplyUsd - totalBorrowUsd),
        apyBase: r.supplyRate,
        apyBaseBorrow: borrowable ? r.borrowRate : undefined,
        borrowable,
        totalSupplyUsd: totalSupplyUsd || undefined,
        totalBorrowUsd,
        ltv: Math.min(1, Math.max(0, r.ltv)),
        underlyingTokens: r.underlying ? [r.underlying] : undefined,
        token: null,
        url: APP_URL,
      };
    })
    .filter(utils.keepFinite);
};

module.exports = {
  protocolId: '9180',
  timetravel: false,
  apy: main,
  url: APP_URL,
};
