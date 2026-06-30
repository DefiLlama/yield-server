/**
 * DorkFi — DefiLlama Yield Server Adapter
 *
 * Reports per-market supply and borrow APY for all DorkFi lending pools
 * on Algorand and Voi Network.
 *
 * Interest Rate Model (kinked utilization curve):
 *   utilization   = totalScaledBorrows / totalScaledDeposits
 *   borrowRateBPS = borrowRate + utilization × slope   (fields in bps)
 *   supplyRateBPS = borrowRateBPS × utilization × (1 − reserveFactor)
 *   APY           = (1 + rateBPS/10000/365)^365 − 1
 */

const axios = require('axios');

const API_BASE = 'https://dorkfi-api.nautilus.sh';
const NETWORK  = { algorand: 'algorand-mainnet', voi: 'voi-mainnet' };
const DL_CHAIN = { algorand: 'Algorand', voi: 'Voi Network' };
const PROJECT  = 'dorkfi';

// ── Known market → token symbol mapping ──────────────────────────────────────
// Voi Pool A (47139778) and Pool B (47139781)
// Algorand Pool A (3333688282) and Pool B (3345940978)
// Algorand symbols resolved from on-chain ASA metadata

const MARKET_SYMBOLS = {
  // Voi Pool A
  41877720: 'VOI',
  395614:   'aUSDC',
  420069:   'UNIT',
  47138068: 'WAD',
  40153155: 'POW',
  413153:   'aALGO',
  40153308: 'aETH',
  40153368: 'aWBTC',
  40153415: 'acbBTC',
  // Voi Pool B
  300279:   'USDC',
  412682:   'ALGO',
  410111:   'USDT',
  419744:   'AVAX',
  302222:   'BNB',
  410811:   'wBTC',
  798968:   'MATIC',
  420024:   'LINK',
  8471125:  'SOL',
  8324600:  'DOT',
  828295:   'ADA',
  770561:   'DOGE',
  // Algorand Pool A + B — symbols from ASA on-chain metadata
  3207744109: 'ALGO',
  3211820549: 'goBTC',
  3210682240: 'USDC',
  3220125024: 'UNIT',
  3080081069: 'POW',
  3210709899: 'aVOI',
  3211827406: 'WBTC',
  3211806149: 'goETH',
  3211811648: 'WETH',
  3211838479: 'LINK',
  3211883276: 'SOL',
  3211885849: 'DOGE',
  3490783147: 'tALGO',
  3490854290: 'tALGO',
  3211805086: 'FINITE',
  3346185062: 'FOLKS',
  3212524778: 'COOP',
  3212773584: 'HAY',
  3346408431: 'WAD',
  3346881192: 'WAD',
  3211890928: 'HAY',
  3212768756: 'GOLD$',
  3212531816: 'SOL',
  3212534634: 'LINK',
  3212771255: 'FOLKS',
  3220347315: 'GOLD$',
  3333688448: 'WAD',
  3211740909: 'FINITE',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchMarketData(chain) {
  const { data } = await axios.get(`${API_BASE}/market-data/${NETWORK[chain]}`);
  if (!data.success) throw new Error(`DorkFi API error: ${chain}`);
  return data.data;
}

async function fetchAnalyticsTVL(chain) {
  const { data } = await axios.get(`${API_BASE}/analytics/tvl/${NETWORK[chain]}`);
  if (!data.success) return {};
  const map = {};
  for (const m of data.data.markets || []) map[`${m.appId}:${m.marketId}`] = m.tvl;
  return map;
}

function dedup(markets) {
  const seen = new Map();
  for (const m of markets) {
    const key = `${m.appId}:${m.marketId}`;
    if (!seen.has(key) || m.lastUpdated > seen.get(key).lastUpdated) seen.set(key, m);
  }
  return [...seen.values()];
}

// ── APY calculation ───────────────────────────────────────────────────────────

function bpsToApy(rateBps) {
  const r = rateBps / 10000;
  return (Math.pow(1 + r / 365, 365) - 1) * 100;
}

function computeRates(market) {
  const totalDep = Number(market.totalScaledDeposits || 0);
  const totalBor = Number(market.totalScaledBorrows  || 0);
  if (totalDep === 0) return { borrowApy: 0, supplyApy: 0, utilization: 0 };

  const utilization   = totalBor / totalDep;
  const borrowRate    = Number(market.borrowRate    || 0);
  const slope         = Number(market.slope         || 0);
  const reserveFactor = Number(market.reserveFactor || 0) / 10000;

  const borrowBps = borrowRate + utilization * slope;
  const supplyBps = borrowBps * utilization * (1 - reserveFactor);

  return {
    borrowApy:   parseFloat(bpsToApy(borrowBps).toFixed(4)),
    supplyApy:   parseFloat(bpsToApy(supplyBps).toFixed(4)),
    utilization,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const apy = async () => {
  const results = [];

  for (const chain of ['algorand', 'voi']) {
    const [markets, tvlMap] = await Promise.all([
      fetchMarketData(chain),
      fetchAnalyticsTVL(chain),
    ]);

    for (const market of dedup(markets)) {
      if (Number(market.totalScaledDeposits || 0) === 0) continue;

      const key    = `${market.appId}:${market.marketId}`;
      const tvlUsd = tvlMap[key] || 0;
      if (tvlUsd < 1) continue;

      const { borrowApy, supplyApy } = computeRates(market);
      const symbol = MARKET_SYMBOLS[market.marketId] || `ASA-${market.marketId}`;

      results.push({
        pool:          `dorkfi-${chain}-${market.appId}-${market.marketId}`,
        chain:         DL_CHAIN[chain],
        project:       PROJECT,
        symbol,
        tvlUsd,
        apyBase:       supplyApy,
        apyBaseBorrow: borrowApy,
        underlyingTokens: [],
        poolMeta:      `Pool ${market.appId}`,
        url:           'https://dork.fi',
      });
    }
  }

  return results;
};

module.exports = { apy, timeTravel: false, url: 'https://dork.fi' };
