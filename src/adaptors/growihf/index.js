const https = require('https');

const VAULT_ADDRESS = '0x1e37a337ed460039d1b15bd3bc489de789768d5e';
const API_URL = 'https://api.hyperliquid.xyz/info';
const ARBITRUM_NATIVE_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const GROWI_ALPHA_VAULT_ID = 2;
const HIBACHI_DATA_API = 'https://data-api.hibachi.xyz';
const USDT_ADDRESS_ARBITRUM = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

function fetchHyperliquidVaultDetails() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      type: 'vaultDetails',
      vaultAddress: VAULT_ADDRESS,
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(API_URL, options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (err) {
          reject('Failed to parse vaultDetails');
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

function computeHyperliquidAPYInception(vaultDetails) {
  const portfolio = vaultDetails.portfolio.find((p) => p[0] === 'allTime');
  if (!portfolio) throw new Error('Missing allTime portfolio');

  const accountValueHistory = portfolio[1].accountValueHistory;
  const pnlHistory = portfolio[1].pnlHistory;

  if (accountValueHistory.length < 3 || pnlHistory.length < 3)
    throw new Error('Not enough data points');

  const timestamps = accountValueHistory.map(([t]) => t);
  const values_tvl = accountValueHistory.map(([, v]) => parseFloat(v));
  const values_pnl = pnlHistory.map(([, v]) => parseFloat(v));

  const deltaPNL = [];

  for (let i = 1; i < timestamps.length; i++) {
    deltaPNL.push(values_pnl[i] - values_pnl[i - 1]);
  }

  const twr = [];
  for (let i = 0; i < deltaPNL.length; i++) {
    twr.push(values_tvl[i] !== 0 ? deltaPNL[i] / values_tvl[i] : 0);
  }

  const twr_acc = [1];
  for (let i = 0; i < twr.length; i++) {
    twr_acc.push(twr_acc[i] * (1 + twr[i]));
  }

  const days = (timestamps[timestamps.length - 1] - timestamps[0]) / 86400000;
  const ann_yield = Math.pow(twr_acc[twr_acc.length - 1], 365 / days) - 1;

  const latestTVL = values_tvl[values_tvl.length - 1];
  return {
    tvlUsd: latestTVL,
    apyBaseInception: ann_yield,
  }
}

function computeHyperliquidAPY7Day(vaultDetails) {
  let alltimeData = computeHyperliquidAPYInception(vaultDetails);

  const portfolio = vaultDetails.portfolio.find((p) => p[0] === 'week');
  if (!portfolio) throw new Error('Missing weekly portfolio');

  const accountValueHistory = portfolio[1].accountValueHistory;
  const pnlHistory = portfolio[1].pnlHistory;

  if (accountValueHistory.length < 3 || pnlHistory.length < 3)
    throw new Error('Not enough data points');

  const timestamps = accountValueHistory.map(([t]) => t);
  const values_tvl = accountValueHistory.map(([, v]) => parseFloat(v));
  const values_pnl = pnlHistory.map(([, v]) => parseFloat(v));

  const deltaPNL = [];

  for (let i = 1; i < timestamps.length; i++) {
    deltaPNL.push(values_pnl[i] - values_pnl[i - 1]);
  }

  const twr = [];
  for (let i = 0; i < deltaPNL.length; i++) {
    twr.push(values_tvl[i] !== 0 ? deltaPNL[i] / values_tvl[i] : 0);
  }

  const twr_acc = [1];
  for (let i = 0; i < twr.length; i++) {
    twr_acc.push(twr_acc[i] * (1 + twr[i]));
  }

  const days = (timestamps[timestamps.length - 1] - timestamps[0]) / 86400000;
  const ann_yield = Math.pow(twr_acc[twr_acc.length - 1], 365 / days) - 1;

  return {
    pool: `growihf-vault-hyperliquid`,
    chain: 'hyperliquid',
    project: 'growihf',
    symbol: 'USDC',
    tvlUsd: alltimeData['tvlUsd'],
    apy: ann_yield * 100,
    apyBaseInception: alltimeData['apyBaseInception'] * 100,
    underlyingTokens: [ARBITRUM_NATIVE_USDC_ADDRESS],
    poolMeta: 'Hyperliquid Vault',
    url: 'https://app.hf.growi.fi/',
  };
}

function fetchHibachiDataAPI(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function groupHibachiIntervalsByDay(intervals) {
  const map = new Map();
  for (const iv of intervals) {
    const day = Math.floor(iv.timestamp / 86400);
    const existing = map.get(day);
    if (!existing || iv.timestamp > existing.timestamp) {
      map.set(day, iv);
    }
  }
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function computeHibachiAPYInterval(intervals) {
  if (intervals.length < 2) throw new Error('Not enough data points');
  const first = intervals[0];
  const last = intervals[intervals.length - 1];
  const days = (last.timestamp - first.timestamp) / 86400;
  if (days <= 0) throw new Error('Non-positive time span');
  const priceRatio =
    parseFloat(last.perSharePrice) / parseFloat(first.perSharePrice);
  if (!(priceRatio > 0)) throw new Error('Invalid share price');
  return Math.pow(priceRatio, 365 / days) - 1;
}

async function computeHibachiAPY7Day() {
  const infoData = await fetchHibachiDataAPI(`${HIBACHI_DATA_API}/vault/info`);
  const info = (infoData || []).find((v) => v.vaultId === GROWI_ALPHA_VAULT_ID);
  if (!info) throw new Error('Growi Alpha Vault info not found');

  const performanceData = await fetchHibachiDataAPI(`${HIBACHI_DATA_API}/vault/performance?vaultId=${GROWI_ALPHA_VAULT_ID}&timeRange=All`);
  const intervals = performanceData.vaultPerformanceIntervals || [];
  if (intervals.length < 3) throw new Error('Not enough data points');

  const apyBaseInception = computeHibachiAPYInterval(intervals);

  const dailyBuckets = groupHibachiIntervalsByDay(intervals);
  const week = dailyBuckets.slice(-7);
  const apy7d =
    week.length >= 2 ? computeHibachiAPYInterval(week) : apyBaseInception;

  const tvlUsdLatest =
    parseFloat(performanceData.vaultPerformanceIntervals.at(-1).totalValueLocked);

  return {
    pool: `growihf-alpha-vault-hibachi`,
    chain: 'hibachi',
    project: 'growihf',
    symbol: 'USDT',
    tvlUsd: tvlUsdLatest,
    apy: apy7d * 100,
    apyBaseInception: apyBaseInception * 100,
    underlyingTokens: [USDT_ADDRESS_ARBITRUM],
    poolMeta: 'Hibachi Vault',
    url: 'https://app.hf.growi.fi/',
  };
}

module.exports = {
  timetravel: false,
  apy: async () => {
    const pools = [];

    const sources = [
      {
        name: 'hyperliquid',
        build: async () => {
          const details = await fetchHyperliquidVaultDetails();
          return computeHyperliquidAPY7Day(details);
        },
      },
      {
        name: 'hibachi',
        build: computeHibachiAPY7Day,
      },
    ];

    for (const { name, build } of sources) {
      try {
        pools.push(await build());
      } catch (err) {
        console.error(`growihf: skipping ${name}: ${err.message}`);
        continue;
      }
    }

    return pools;
  },
};
