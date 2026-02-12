const axios = require('axios');

const utils = require('../utils');

const BACKEND_API_URL = 'https://api-defi.kaspa.com/dex';
const CHAIN = 'kasplex';
const FEE_RATE = 0.01;
const DAY_IN_SECONDS = 86400;

const fetchKasPrice = async () => {
  try {
    const priceKey = 'coingecko:kaspa';
    const kaspa = (
      await utils.getData(`https://coins.llama.fi/prices/current/${priceKey}`)
    ).coins[priceKey].price;
    if (Number.isFinite(kaspa) && kaspa > 0) return kaspa;
  } catch (error) {
    console.log('Kas price from CoinGecko failed, falling back to API', error);
    try {
      const { data } = await axios.get('https://api.kaspa.org/info/price');
      const price = Number(data.price);
      if (Number.isFinite(price) && price > 0) return price;
    } catch (fallbackError) {
      console.log('Kas price from API also failed', fallbackError);
    }
  }

  return 0;
};

const fetchPairs = async () => {
  return await utils.getData(
    BACKEND_API_URL + '/graph-pairs'
  )
};

const fetchPairDayData = async (pairIds) => {
  if (pairIds.length === 0) return { daily: {}, weekly: {} };

  const now = Math.floor(Date.now() / 1000);
  const startDay = now - DAY_IN_SECONDS;
  const startWeek = now - 7 * DAY_IN_SECONDS;

  // Fetch 1-day and 7-day volume data in parallel
  const dailyUrl = `${BACKEND_API_URL}/most-traded/pairs?minDate=${startDay}`;
  const weeklyUrl = `${BACKEND_API_URL}/most-traded/pairs?minDate=${startWeek}`;

  const [dailyResponse, weeklyResponse] = await Promise.all([
    utils.getData(dailyUrl).catch(() => ({ pairs: [] })),
    utils.getData(weeklyUrl).catch(() => ({ pairs: [] })),
  ]);

  // Extract pairs array from response
  const dailyPairs = Array.isArray(dailyResponse?.pairs) ? dailyResponse.pairs : [];
  const weeklyPairs = Array.isArray(weeklyResponse?.pairs) ? weeklyResponse.pairs : [];

  // Build volume maps from responses
  const daily = {};
  const weekly = {};

  dailyPairs.forEach((entry) => {
    const pairId = entry.pair?.id?.toLowerCase();
    const volumeKas = Number(entry.amountKAS);
    if (pairId && Number.isFinite(volumeKas) && volumeKas > 0) {
      daily[pairId] = volumeKas;
    }
  });

  weeklyPairs.forEach((entry) => {
    const pairId = entry.pair?.id?.toLowerCase();
    const volumeKas = Number(entry.amountKAS);
    if (pairId && Number.isFinite(volumeKas) && volumeKas > 0) {
      weekly[pairId] = volumeKas;
    }
  });

  return { daily, weekly };
};

const buildPools = (pairs, volumeData, kasPrice) => {
  const { daily, weekly } = volumeData;

  return pairs
    .map((pair) => {
      const pairId = pair.id.toLowerCase();
      const kasReserve =
        Number(pair.trackedReserveKAS ?? pair.reserveKAS ?? 0) || 0;
      if (!(Number.isFinite(kasReserve) && kasReserve > 10000)) return null;
      const tvlUsd = kasReserve * kasPrice;

      const volumeKas1d = daily[pairId] ?? 0;
      const volumeKas7d = weekly[pairId] ?? 0;

      const volumeUsd1d = volumeKas1d * kasPrice;
      const volumeUsd7d = volumeKas7d * kasPrice;

      const apyBase =
        tvlUsd > 0 ? ((volumeUsd1d * FEE_RATE * 365) / tvlUsd) * 100 : 0;
      const apyBase7d =
        tvlUsd > 0 ? ((volumeUsd7d * FEE_RATE * 52) / tvlUsd) * 100 : 0;

      const symbol = utils.formatSymbol(
        `${pair.token0.symbol}-${pair.token1.symbol}`
      );

      return {
        pool: `${pair.id}-${CHAIN}`,
        chain: CHAIN,
        project: 'kaspacom-dex',
        symbol,
        tvlUsd,
        apyBase,
        apyBase7d,
        volumeUsd1d,
        volumeUsd7d,
        underlyingTokens: [pair.token0.id, pair.token1.id],
        url: 'https://defi.kaspa.com',
      };
    })
    .filter((pool) => pool && utils.keepFinite(pool));
};

const apy = async () => {
  const [pairs, kasPrice] = await Promise.all([fetchPairs(), fetchKasPrice()]);
  if (!pairs.length || !Number.isFinite(kasPrice) || kasPrice <= 0) {
    return [];
  }

  const pairIds = pairs.map((pair) => pair.id.toLowerCase());
  const volumeData = await fetchPairDayData(pairIds);

  return buildPools(pairs, volumeData, kasPrice);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://defi.kaspa.com',
};
	