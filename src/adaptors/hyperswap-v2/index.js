const { request, gql } = require('graphql-request');
const utils = require('../utils');

const PROJECT = 'hyperswap-v2';
const CHAIN = 'hyperevm';
const MIN_TVL_USD = 1000;

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_cm97l77ib0cz601wlgi9wb0ec/subgraphs/hyperswap-v2/1.0.5/gn';

const FEE_TIER = 3000;

const pairsQuery = gql`
  query getPairs($first: Int!, $skip: Int!) {
    pairs(
      first: $first
      skip: $skip
      orderBy: reserveUSD
      orderDirection: desc
      where: { reserveUSD_gt: 1000 }
    ) {
      id
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      reserve0
      reserve1
      reserveUSD
      volumeUSD
    }
  }
`;

const pairDayDataQuery = gql`
  query getPairDayData($pairAddresses: [String!], $startTime: Int!) {
    pairDayDatas(
      first: 1000
      orderBy: date
      orderDirection: desc
      where: { pairAddress_in: $pairAddresses, date_gt: $startTime }
    ) {
      pairAddress
      dailyVolumeUSD
      date
    }
  }
`;

async function fetchAllPairs() {
  let allPairs = [];
  let skip = 0;
  const first = 1000;

  while (true) {
    try {
      const data = await request(SUBGRAPH_URL, pairsQuery, {
        first,
        skip,
      });
      const pairs = data.pairs;

      if (pairs.length === 0) break;

      allPairs = allPairs.concat(pairs);

      if (pairs.length < first) break;

      skip += first;
    } catch (error) {
      console.error('Error fetching pairs from subgraph:', error);
      throw error;
    }
  }

  return allPairs;
}

async function fetchPairDayData(pairAddresses) {
  // Get data from the last 7 days
  const startTime = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  try {
    const result = await request(SUBGRAPH_URL, pairDayDataQuery, {
      pairAddresses,
      startTime,
    });

    const volumesByPair = {};
    const lastDayVolumeByPair = {};

    const pairDayDatas = result.pairDayDatas || [];
    
    for (const dayData of pairDayDatas) {
      const pairAddr = dayData.pairAddress.toLowerCase();
      const volume = parseFloat(dayData.dailyVolumeUSD) || 0;

      if (!volumesByPair[pairAddr]) {
        volumesByPair[pairAddr] = 0;
      }
      volumesByPair[pairAddr] += volume;

      if (
        !lastDayVolumeByPair[pairAddr] ||
        dayData.date > lastDayVolumeByPair[pairAddr].date
      ) {
        lastDayVolumeByPair[pairAddr] = {
          date: dayData.date,
          volume: volume,
        };
      }
    }

    return {
      weeklyVolumes: volumesByPair,
      lastDayVolumes: Object.fromEntries(
        Object.entries(lastDayVolumeByPair).map(([k, v]) => [k, v.volume])
      ),
    };
  } catch (error) {
    console.error('Error fetching pair day data:', error);
    return { weeklyVolumes: {}, lastDayVolumes: {} };
  }
}

function calculateApyBase(volumeUSD1d, tvlUSD) {
  if (!tvlUSD || tvlUSD <= 0) return 0;
  if (!volumeUSD1d || volumeUSD1d <= 0) return 0;

  // Fee is 0.3% of volume (FEE_TIER / 1e6)
  const feeUSD1d = (volumeUSD1d * FEE_TIER) / 1e6;
  const apyBase = ((feeUSD1d * 365) / tvlUSD) * 100;
  return apyBase;
}

async function apy() {
  try {
    const pairs = await fetchAllPairs();

    const pairAddresses = pairs.map((p) => p.id.toLowerCase());

    const { weeklyVolumes, lastDayVolumes } =
      await fetchPairDayData(pairAddresses);

    const formattedPools = pairs
      .map((pair) => {
        const tvlUSD = Number(pair.reserveUSD) || 0;

        if (tvlUSD < MIN_TVL_USD) return null;

        const pairId = pair.id.toLowerCase();
        const volumeUSD1d = lastDayVolumes[pairId] || 0;
        const volumeUSD7d = weeklyVolumes[pairId] || 0;

        const apyBase = calculateApyBase(volumeUSD1d, tvlUSD);

        // 7-day APY calculation (annualised from weekly)
        const apyBase7d =
          volumeUSD7d > 0
            ? ((volumeUSD7d * FEE_TIER) / 1e6 / tvlUSD) * 52 * 100
            : null;

        return {
          pool: pairId,
          chain: utils.formatChain(CHAIN),
          project: PROJECT,
          symbol: utils.formatSymbol(
            `${pair.token0.symbol}-${pair.token1.symbol}`
          ),
          tvlUsd: tvlUSD,
          apyBase: apyBase || 0,
          apyBase7d: apyBase7d,
          underlyingTokens: [
            pair.token0.id.toLowerCase(),
            pair.token1.id.toLowerCase(),
          ],
          url: `https://app.hyperswap.exchange/#/add/v2/${pair.token0.id}/${pair.token1.id}`,
          volumeUsd1d: volumeUSD1d,
          volumeUsd7d: volumeUSD7d,
        };
      })
      .filter((pool) => pool !== null);

    return formattedPools.filter((p) => utils.keepFinite(p));
  } catch (error) {
    console.error('Error in HyperSwap V2 adapter:', error);
    throw error;
  }
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.hyperswap.exchange',
};