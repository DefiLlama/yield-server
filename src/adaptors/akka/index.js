const axios = require('axios');
const utils = require('../utils');

const VAULT_ADDRESS = '0x0e008684ae576f280c5426a89d3f5e1da1fc7398';
const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const PRODUCTION_LIVE_MS = new Date('2026-04-15T00:00:00Z').getTime();

const apy = async () => {
  const { data } = await axios.post(
    HL_INFO_URL,
    { type: 'vaultDetails', vaultAddress: VAULT_ADDRESS },
    { timeout: 10_000 },
  );

  // TVL = sum of all follower vault equity (skip malformed entries)
  const tvlUsd = (data.followers ?? []).reduce((sum, f) => {
    const equity = Number(f.vaultEquity);
    return Number.isFinite(equity) ? sum + equity : sum;
  }, 0);

  // APY from Hyperliquid's reported APR (already annualized)
  const apr = Number(data.apr);

  // Compute base APY from PnL history since production live date
  const historyEntry = (data.portfolio ?? []).find(([k]) => k === 'allTime');
  const rawPnl = historyEntry?.[1]?.pnlHistory ?? [];
  const rawAV = historyEntry?.[1]?.accountValueHistory ?? [];

  let apyBase = null;

  if (rawPnl.length > 0 && rawAV.length > 0) {
    const pnlSorted = rawPnl
      .map(([t, v]) => [t, Number(v)])
      .sort(([a], [b]) => a - b);
    const avSorted = rawAV
      .map(([t, v]) => [t, Number(v)])
      .sort(([a], [b]) => a - b);

    // Consistent cutoff: first sample at or after PRODUCTION_LIVE_MS
    const firstAtOrAfter = (series, cutoff, constraint) =>
      series.find(([t, v]) => t >= cutoff && Number.isFinite(v) && (!constraint || constraint(v)));

    const pnlStart = firstAtOrAfter(pnlSorted, PRODUCTION_LIVE_MS);
    const avStart = firstAtOrAfter(avSorted, PRODUCTION_LIVE_MS, (v) => v > 0);
    const liveStartPnl = pnlStart ? pnlStart[1] : 0;
    const liveStartValue = avStart ? avStart[1] : 0;

    if (liveStartValue > 0 && pnlSorted.length > 0) {
      const currentPnl = pnlSorted[pnlSorted.length - 1][1];
      const livePnlDelta = currentPnl - liveStartPnl;
      const cumulativeReturn = livePnlDelta / liveStartValue;

      // Annualize based on elapsed days
      const liveDays =
        (pnlSorted[pnlSorted.length - 1][0] - PRODUCTION_LIVE_MS) / 86_400_000;
      if (liveDays > 0) {
        apyBase = (cumulativeReturn / liveDays) * 365 * 100; // as percentage
      }
    }
  }

  // Fallback to Hyperliquid-reported APR if calculation fails
  if (apyBase === null || !isFinite(apyBase)) {
    apyBase = isFinite(apr) ? apr * 100 : null;
  }

  return [
    {
      pool: `${VAULT_ADDRESS}-hyperliquid`.toLowerCase(),
      chain: utils.formatChain('Hyperliquid'),
      project: 'akka',
      symbol: 'USDC',
      tvlUsd,
      apyBase,
      poolMeta: 'AI Quant Vault',
      url: 'https://app.akka.finance/vault',
    },
  ].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.akka.finance/vault',
};
