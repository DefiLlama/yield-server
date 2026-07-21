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
const REQUEST_TIMEOUT_MS = 30_000;

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

const MARKET_COINGECKO_IDS = {
  41877720: 'coingecko:voi-network',
  395614:   'coingecko:aave-v3-usdc',
  413153:   'coingecko:algorand',
  40153308: 'coingecko:ethereum',
  40153368: 'coingecko:wrapped-bitcoin',
  40153415: 'coingecko:coinbase-wrapped-btc',
  300279:   'coingecko:usd-coin',
  412682:   'coingecko:algorand',
  410111:   'coingecko:tether',
  419744:   'coingecko:avalanche-2',
  302222:   'coingecko:binancecoin',
  410811:   'coingecko:wrapped-bitcoin',
  798968:   'coingecko:matic-network',
  420024:   'coingecko:chainlink',
  8471125:  'coingecko:solana',
  8324600:  'coingecko:polkadot',
  828295:   'coingecko:cardano',
  770561:   'coingecko:dogecoin',
  3207744109: 'coingecko:algorand',
  3211820549: 'coingecko:bitcoin',
  3210682240: 'coingecko:usd-coin',
  3210709899: 'coingecko:voi-network',
  3211827406: 'coingecko:wrapped-bitcoin',
  3211806149: 'coingecko:ethereum',
  3211811648: 'coingecko:weth',
  3211838479: 'coingecko:chainlink',
  3211883276: 'coingecko:solana',
  3211885849: 'coingecko:dogecoin',
  3346185062: 'coingecko:folks',
  3212524778: 'coingecko:coop-coin',
  3212531816: 'coingecko:solana',
  3212534634: 'coingecko:chainlink',
  3212771255: 'coingecko:folks',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchMarketData(chain) {
  try {
    const { data } = await axios.get(`${API_BASE}/market-data/${NETWORK[chain]}`, {
      timeout: REQUEST_TIMEOUT_MS,
    });
    if (!data.success) return [];
    return data.data || [];
  } catch (error) {
    console.warn(`DorkFi market data unavailable for ${chain}: ${error.message}`);
    return [];
  }
}

async function fetchAnalyticsTVL(chain) {
  try {
    const { data } = await axios.get(`${API_BASE}/analytics/tvl/${NETWORK[chain]}`, {
      timeout: REQUEST_TIMEOUT_MS,
    });
    if (!data.success) return {};
    const map = {};
    for (const m of data.data.markets || []) map[`${m.appId}:${m.marketId}`] = m.tvl;
    return map;
  } catch (error) {
    console.warn(`DorkFi TVL data unavailable for ${chain}: ${error.message}`);
    return {};
  }
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

function getUnderlyingTokens(market) {
  return [MARKET_COINGECKO_IDS[market.marketId] || String(market.marketId)];
}

function getUsdValues(market, totalSupplyUsd) {
  const totalDep = Number(market.totalScaledDeposits || 0);
  const totalBor = Number(market.totalScaledBorrows  || 0);
  const utilization = totalDep === 0 ? 0 : totalBor / totalDep;
  const totalBorrowUsd = totalSupplyUsd * utilization;

  return {
    totalSupplyUsd,
    totalBorrowUsd,
    availableLiquidityUsd: Math.max(totalSupplyUsd - totalBorrowUsd, 0),
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
      if (market.paused) continue;

      const key    = `${market.appId}:${market.marketId}`;
      const hasTvl = Object.prototype.hasOwnProperty.call(tvlMap, key);
      if (!hasTvl) {
        console.warn(`DorkFi TVL missing for ${chain} market ${key}`);
        continue;
      }

      const totalSupplyUsd = Number(tvlMap[key]) || 0;
      const { totalBorrowUsd, availableLiquidityUsd } = getUsdValues(market, totalSupplyUsd);
      const tvlUsd = availableLiquidityUsd;
      if (tvlUsd < 1) continue;

      const { borrowApy, supplyApy } = computeRates(market);
      const symbol = MARKET_SYMBOLS[market.marketId] || `ASA-${market.marketId}`;
      const ltv = Number(market.collateralFactor || 0) / 10000;

      results.push({
        pool:          `dorkfi-${chain}-${market.appId}-${market.marketId}`,
        chain:         DL_CHAIN[chain],
        project:       PROJECT,
        symbol,
        tvlUsd,
        apyBase:       supplyApy,
        apyBaseBorrow: borrowApy,
        totalSupplyUsd,
        totalBorrowUsd,
        ltv,
        underlyingTokens: getUnderlyingTokens(market),
        poolMeta:      `Pool ${market.appId}`,
        url:           'https://dork.fi',
      });
    }
  }

  return results;
};

module.exports = { apy, timetravel: false, url: 'https://dork.fi', protocolId: 7531 };
