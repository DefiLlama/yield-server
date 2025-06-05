const sdk = require('@defillama/sdk');
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

function computeAPY(vaultDetails) {
  const portfolio = vaultDetails.portfolio.find((p) => p[0] === 'allTime');
  if (!portfolio) throw new Error('Missing allTime portfolio');

  const accountValueHistory = portfolio[1].accountValueHistory;
  const pnlHistory = portfolio[1].pnlHistory;

  if (accountValueHistory.length < 3 || pnlHistory.length < 3)
    throw new Error('Not enough data points');

  const timestamps = accountValueHistory.map(([t]) => t);
  const values_tvl = accountValueHistory.map(([, v]) => parseFloat(v));
  const values_pnl = pnlHistory.map(([, v]) => parseFloat(v));

  const deltaTime = [];
  const deltaTVL = [];
  const deltaPNL = [];
  const netFlows = [];

  for (let i = 1; i < timestamps.length; i++) {
    const dt = (timestamps[i] - timestamps[i - 1]) / 86400000;
    deltaTime.push(dt);

    deltaTVL.push(values_tvl[i] - values_tvl[i - 1]);
    deltaPNL.push(values_pnl[i] - values_pnl[i - 1]);
    netFlows.push(deltaTVL[i - 1] - deltaPNL[i - 1]);
  }

  const twr = [];
  for (let i = 1; i < deltaPNL.length; i++) {
    const denominator = netFlows[i] + values_tvl[i];
    twr.push(denominator !== 0 ? deltaPNL[i] / denominator : 0);
  }

  const twr_acc = [1];
  for (let i = 0; i < twr.length; i++) {
    twr_acc.push(twr_acc[i] * (1 + twr[i]));
  }

  const days = (timestamps[timestamps.length - 1] - timestamps[0]) / 86400000;
  const ann_yield = Math.pow(twr_acc[twr_acc.length - 1], 365 / days) - 1;

  const latestTVL = values_tvl[values_tvl.length - 1];

  return {
    pool: `growihf-vault-hyperliquid`,
    chain: 'Hyperliquid',
    project: 'growihf',
    symbol: 'USDC',
    tvlUsd: latestTVL,
    apy: ann_yield * 100,
    underlyingTokens: [USDC_ADDRESS_ARBITRUM],
    poolMeta: 'Hyperliquid Vault',
    url: 'https://app.hf.growi.fi/',
  };
}

module.exports = {
  timetravel: false,
  apy: async () => {
    const vaultDetails = await fetchVaultDetails();
    return [computeAPY(vaultDetails)];
  },
};
