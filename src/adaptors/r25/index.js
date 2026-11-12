const utils = require('../utils');

const RCUSDP =
  '0x4dea4916aa61f522aca69c4e7265b8e3bdd65d3947f4fb9aaa6d87e0dfac35fd::rcusdp::RCUSDP';
const RCUSD =
  '0x4dea4916aa61f522aca69c4e7265b8e3bdd65d3947f4fb9aaa6d87e0dfac35fd::rcusd::RCUSD';
const KEY = `sui:${RCUSDP}`;
const UNDERLYING_KEY = `sui:${RCUSD}`;
const PRICE_KEYS = `${KEY},${UNDERLYING_KEY}`;
const DAY = 24 * 60 * 60;
const APY_LOOKBACK_DAYS = 30;

const poolsFunction = async () => {
  const now = Math.floor(Date.now() / 1000);
  const past = now - APY_LOOKBACK_DAYS * DAY;

  const [{ supply, decimals }, current, historical] = await Promise.all([
    utils.suiCoinSupply(RCUSDP),
    utils.getPriceApiData(`/prices/current/${PRICE_KEYS}`),
    utils
      .getPriceApiData(
        `/chart/${PRICE_KEYS}?start=${past}&span=${APY_LOOKBACK_DAYS}&period=1d`
      )
      .catch((error) => {
        console.error('r25: price history unavailable:', error.message);
        return { coins: {} };
      }),
  ]);

  const share = current.coins[KEY];
  const underlying = current.coins[UNDERLYING_KEY];
  const isPrice = (price) => Number.isFinite(price) && price > 0;
  if (!isPrice(share?.price) || !isPrice(underlying?.price)) return [];
  if (share.timestamp !== underlying.timestamp) return [];

  const pricePerShare = share.price / underlying.price;
  const tvlUsd = (Number(supply) / 10 ** decimals) * share.price;
  const underlyingHistory = new Map(
    (historical.coins?.[UNDERLYING_KEY]?.prices || [])
      .filter((point) => isPrice(point.price))
      .map((point) => [point.timestamp, point.price])
  );
  // Use the oldest valid pair in the window, matching the exact pricing timestamp.
  const first = (historical.coins?.[KEY]?.prices || [])
    .filter(
      (point) =>
        isPrice(point.price) &&
        point.timestamp >= past &&
        point.timestamp <= share.timestamp - DAY &&
        underlyingHistory.has(point.timestamp)
    )
    .sort((a, b) => a.timestamp - b.timestamp)[0];
  const elapsedDays = first ? (share.timestamp - first.timestamp) / DAY : 0;
  const pastRate = first
    ? first.price / underlyingHistory.get(first.timestamp)
    : undefined;
  // Both USD prices include the same USDC quote; dividing cancels its movement.
  const apyBase = first
    ? ((pricePerShare / pastRate) ** (365 / elapsedDays) - 1) * 100
    : 0;

  return [
    {
      pool: `${RCUSDP}-sui`.toLowerCase(),
      chain: utils.formatChain('sui'),
      project: 'r25',
      symbol: 'rcUSDp',
      tvlUsd,
      apyBase,
      pricePerShare,
      underlyingTokens: [RCUSD],
      url: 'https://app.r25.xyz/staking/rcusdp',
    },
  ];
};

module.exports = {
  protocolId: '7766',
  timetravel: false,
  apy: poolsFunction,
  apyWindowDays: APY_LOOKBACK_DAYS,
  url: 'https://www.r25.xyz/',
};
