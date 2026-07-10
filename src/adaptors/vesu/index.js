const utils = require('../utils');

const API_URL = 'https://api.vesu.xyz/markets';
const STRK_TOKEN =
  '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

const toNumber = (amount) => {
  if (!amount || amount.value === undefined || amount.value === null)
    return null;

  const value = Number(amount.value) / 10 ** Number(amount.decimals ?? 0);
  return Number.isFinite(value) ? value : null;
};

const toPercent = (amount) => {
  const value = toNumber(amount);
  return value === null ? null : value * 100;
};

const sumRates = (...rates) =>
  rates.reduce((sum, rate) => sum + (Number.isFinite(rate) ? rate : 0), 0);

const poolsFunction = async () => {
  const markets = await utils.getData(API_URL);

  return markets.data
    .map((market) => {
      const { pool, stats = {}, symbol, usdPrice, address } = market;
      const totalSuppliedToken = toNumber(stats.totalSupplied);
      const totalDebtToken = toNumber(stats.totalDebt) ?? 0;
      const priceUsd = toNumber(usdPrice);
      const maxUtilization = toNumber(market.config?.maxUtilization);

      if (!totalSuppliedToken || !priceUsd) return null;

      const totalSupplyUsd = totalSuppliedToken * priceUsd;
      const totalBorrowUsd = totalDebtToken * priceUsd;
      const tvlUsd = totalSupplyUsd - totalBorrowUsd;
      const borrowable = stats.canBeBorrowed === true;
      const borrowHeadroomUsd =
        maxUtilization === null
          ? tvlUsd
          : totalSupplyUsd * maxUtilization - totalBorrowUsd;
      const availableBorrowUsd = borrowable
        ? Math.max(Math.min(tvlUsd, borrowHeadroomUsd), 0)
        : 0;
      const apyBase = toPercent(stats.supplyApy);

      const apyReward = sumRates(
        toPercent(stats.defiSpringSupplyApr),
        toPercent(stats.btcFiSupplyApr)
      );
      const apyBaseBorrow = toPercent(stats.borrowApr);

      const poolData = {
        pool: `${pool.id}-${symbol}-starknet`,
        chain: 'Starknet',
        project: 'vesu',
        symbol,
        tvlUsd,
        apyBase,
        totalSupplyUsd,
        totalBorrowUsd,
        availableBorrowUsd,
        borrowToken: address,
        borrowable,
        underlyingTokens: [address],
        url: `https://vesu.xyz/lite/markets/${pool.id}/${address}?collateralAssetAddress=${address}`,
        poolMeta: pool.name,
        routeGroupKey: pool.id.toLowerCase(),
      };

      if (apyBaseBorrow !== null) poolData.apyBaseBorrow = apyBaseBorrow;
      if (apyReward > 0) {
        poolData.apyReward = apyReward;
        poolData.rewardTokens = [STRK_TOKEN];
      }

      return poolData;
    })
    .filter(Boolean);
};

module.exports = {
  protocolId: '4877',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.vesu.xyz',
};
