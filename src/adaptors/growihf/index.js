const https = require('https');

const VAULT_ADDRESS = '0x1e37a337ed460039d1b15bd3bc489de789768d5e';
const API_URL = 'https://api.hyperliquid.xyz/info';
const USDC_ADDRESS_ARBITRUM = '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8';

function fetchVaultDetails() {
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

function computeAPYInception(vaultDetails) {
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

function computeAPY7Day(vaultDetails) {
  let alltimeData = computeAPYInception(vaultDetails);

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
    underlyingTokens: [USDC_ADDRESS_ARBITRUM],
    poolMeta: 'Hyperliquid Vault',
    url: 'https://app.hf.growi.fi/',
  };
}

module.exports = {
  timetravel: false,
  apy: async () => {
    const vaultDetails = await fetchVaultDetails();
    return [computeAPY7Day(vaultDetails)];
  },
};
