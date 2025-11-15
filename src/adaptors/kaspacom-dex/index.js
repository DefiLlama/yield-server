const axios = require('axios');
const { request, gql } = require('graphql-request');
const { chunk } = require('lodash');

const utils = require('../utils');

const SUBGRAPH_URL =
  'https://graph-kasplex.kaspa.com/subgraphs/name/kasplex-kas-v2-core';
const CHAIN = 'kasplex';
const FEE_RATE = 0.01;
const PAGE_SIZE = 1000;
const DAY_IN_SECONDS = 86400;

const PAIRS_QUERY = gql`
  query getPairs($first: Int!, $skip: Int!) {
    pairs(
      first: $first
      skip: $skip
      orderBy: reserveKAS
      orderDirection: desc
    ) {
      id
      token0 {
        id
        symbol
      }
      token1 {
        id
        symbol
      }
      reserveKAS
      trackedReserveKAS
      reserve0
      reserve1
      volumeKAS
    }
  }
`;

const PAIR_DAY_DATA_QUERY = gql`
  query getPairDayData($pairAddresses: [Bytes!]!, $startTime: Int!) {
    pairDayDatas(
      first: 1000
      orderBy: date
      orderDirection: desc
      where: { pairAddress_in: $pairAddresses, date_gt: $startTime }
    ) {
      date
      pairAddress
      dailyVolumeKAS
    }
  }
`;

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
  const pairs = [];
  let skip = 0;

  while (true) {
    const { pairs: page } = await request(SUBGRAPH_URL, PAIRS_QUERY, {
      first: PAGE_SIZE,
      skip,
    });
    pairs.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return pairs;
};

const fetchPairDayData = async (pairIds) => {
  if (pairIds.length === 0) return { daily: {}, weekly: {} };

  const startWeek = Math.floor(Date.now() / 1000) - 7 * DAY_IN_SECONDS;
  const volumes = {};
  const latestDaily = {};

  for (const batch of chunk(pairIds, 75)) {
    const { pairDayDatas } = await request(SUBGRAPH_URL, PAIR_DAY_DATA_QUERY, {
      pairAddresses: batch,
      startTime: startWeek,
    });

    pairDayDatas.forEach((entry) => {
      const pairAddress = entry.pairAddress?.toLowerCase();
      const volumeKas = Number(entry.dailyVolumeKAS);
      if (!pairAddress || !Number.isFinite(volumeKas)) return;

      if (!volumes[pairAddress]) {
        volumes[pairAddress] = 0;
      }
      volumes[pairAddress] += volumeKas;

      if (
        !latestDaily[pairAddress] ||
        entry.date > latestDaily[pairAddress].date
      ) {
        latestDaily[pairAddress] = {
          date: entry.date,
          volumeKas,
        };
      }
    });
  }

  return {
    daily: Object.fromEntries(
      Object.entries(latestDaily).map(([pair, { volumeKas }]) => [
        pair,
        volumeKas,
      ])
    ),
    weekly: volumes,
  };
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
