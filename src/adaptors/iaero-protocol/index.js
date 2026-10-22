const axios = require('axios');

const DATA_URL = 'https://raw.githubusercontent.com/iaeroProtocol/ChainProcessingBot/main/data/estimated_rewards_usd.json';

// Aero AERO on Base. iAERO's backing moved from Aerodrome veAERO to a permanent Aero stake
// on 2026-10-22; the old Aerodrome AERO was 0x940181a94A35A4569E4529A3CDfB74e38FD98631.
const AERO_TOKEN = '0x3f5bF3EdAc59d650D8fDf9657a71F2f904A3a4Ee';
// Pool id only: the original PermalockVault address, kept so the pool's history continues.
// It no longer holds the backing.
const VAULT_ADDRESS = '0x180DAB53968e599Dd43CF431E27CB01AA5C37909';
// Data older than this (more than a full weekly epoch) is not a current yield, so the run fails instead.
const MAX_DATA_AGE_MS = 8 * 24 * 60 * 60 * 1000;

// Publish time: `updatedAt` (ISO; written by both the legacy keeper and ChainProcessingBot),
// else ChainProcessingBot's `updateTimestamp` (unix seconds).
const publishedAtMs = (data) => {
  const iso = Date.parse(data.updatedAt);
  if (Number.isFinite(iso)) return iso;
  const ts = Number(data.updateTimestamp);
  return Number.isFinite(ts) && ts > 0 ? ts * 1000 : NaN;
};

const main = async () => {
  // Use axios directly to avoid any caching in utils.getData
  const response = await axios.get(DATA_URL, {
    headers: {
      'Cache-Control': 'no-cache',
      'Accept': 'application/json'
    }
  });
  
  const data = response.data;

  // Validate response
  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid data response: ${JSON.stringify(data)}`);
  }

  // Refuse stale data rather than keep reporting an old APY/TVL
  const ageMs = Date.now() - publishedAtMs(data);
  if (!Number.isFinite(ageMs) || ageMs > MAX_DATA_AGE_MS) {
    throw new Error(`Stale data: updatedAt=${data.updatedAt}, updateTimestamp=${data.updateTimestamp}`);
  }

  // Parse TVL - string in 1e18 precision
  const tvlUsdRaw = data.tvlUSD_1e18;
  if (!tvlUsdRaw) {
    throw new Error(`Missing tvlUSD_1e18. Fields: ${Object.keys(data).join(', ')}`);
  }
  const tvlUsd = Number(tvlUsdRaw) / 1e18;

  // Parse APY - string like "42.5"
  const apyRaw = data.apyPct;
  if (apyRaw === undefined || apyRaw === null) {
    throw new Error(`Missing apyPct. Fields: ${Object.keys(data).join(', ')}`);
  }
  const apy = Number(apyRaw);

  // Validate
  if (!Number.isFinite(tvlUsd) || tvlUsd < 0) {
    throw new Error(`Invalid tvlUsd: ${tvlUsd}`);
  }
  if (!Number.isFinite(apy) || apy < 0) {
    throw new Error(`Invalid apy: ${apy}`);
  }

  return [{
    pool: VAULT_ADDRESS,
    chain: 'Base',
    project: 'iaero-protocol',
    symbol: 'iAERO',
    tvlUsd,
    apyBase: apy,
    underlyingTokens: [AERO_TOKEN],
    url: 'https://iaero.finance'
  }];
};

module.exports = {
  protocolId: '7039',
  timetravel: false,
  apy: main,
  url: 'https://iaero.finance',
};