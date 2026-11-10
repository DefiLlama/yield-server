const axios = require('axios');
const utils = require('../utils');

const SUI_GRAPHQL = 'https://graphql.mainnet.sui.io/graphql';
const RCUSDP =
  '0x4dea4916aa61f522aca69c4e7265b8e3bdd65d3947f4fb9aaa6d87e0dfac35fd::rcusdp::RCUSDP';
const RCUSD =
  '0x4dea4916aa61f522aca69c4e7265b8e3bdd65d3947f4fb9aaa6d87e0dfac35fd::rcusd::RCUSD';
const KEY = `sui:${RCUSDP}`;
const DAY = 24 * 60 * 60;
const APY_LOOKBACK_DAYS = 30;

const poolsFunction = async () => {
  const now = Math.floor(Date.now() / 1000);
  const past = now - APY_LOOKBACK_DAYS * DAY;

  const [supplyRes, current, historical] = await Promise.all([
    axios.post(SUI_GRAPHQL, {
      query: `{ coinMetadata(coinType: "${RCUSDP}") { supply decimals } }`,
    }),
    utils.getPriceApiData(`/prices/current/${KEY}`),
    utils.getPriceApiData(`/chart/${KEY}?start=${past}&span=${APY_LOOKBACK_DAYS}&period=1d`),
  ]);

  const { supply, decimals } = supplyRes.data.data.coinMetadata;

  const priceNow = current.coins[KEY]?.price;
  // price history starts when R25 pricing went live, so use the oldest point inside the window
  const first = historical.coins[KEY]?.prices?.[0];
  if (!priceNow) return [];

  const tvlUsd = (Number(supply) / 10 ** decimals) * priceNow;
  // rcUSDp is staked rcUSD, so its price is the staking index and the 30d change is the yield.
  const elapsedDays = first ? (now - first.timestamp) / DAY : 0;
  const apyBase =
    first?.price > 0 && elapsedDays >= 1
      ? ((priceNow / first.price) ** (365 / elapsedDays) - 1) * 100
      : 0;

  return [
    {
      pool: `${RCUSDP}-sui`.toLowerCase(),
      chain: utils.formatChain('sui'),
      project: 'r25',
      symbol: 'rcUSDp',
      tvlUsd,
      apyBase,
      pricePerShare: priceNow,
      underlyingTokens: [RCUSD],
    },
  ];
};

module.exports = {
  protocolId: '7766',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://www.r25.xyz/',
};
