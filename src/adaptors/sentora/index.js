const axios = require('axios');
const utils = require('../utils');

// Sentora's own canonical vault registry. Each vault carries an `analytics`
// block with tvlUsd and apy7d/apy30d. TVL is verifiable on-chain (upshift
// getTotalAssets / kamino api), spot-checked and matches. Reshaping this means
// new vaults appear automatically once Sentora adds them to their API.
const API = 'https://services.vaults.sentora.com/vaults';
const MIN_TVL_USD = 1000; // drop dust/seed vaults

// Host protocols already tracked by their own adapter (morpho-blue, euler-v2).
// Listing their vaults here too would duplicate data, so we skip them and only
// surface the genuinely-new pools (Kamino kvaults, Upshift-tech Smart Vaults)
// that have no host adapter today.
// Open question (Felix / slasher): a per-pool `curator` field would let a
// morpho/euler pool show on Sentora's page without duplicating the row. Until
// that exists, those pools stay under their host protocol only.
const HOST_TRACKED = new Set(['morpho', 'eulerv2']);

const apy = async () => {
  const { data } = await axios.get(API);
  const vaults = Array.isArray(data) ? data : data.vaults || data.data || [];

  return vaults
    .map((v) => {
      const a = v.analytics;
      const dt = v.depositToken;
      const tvlUsd = Number(a?.tvlUsd);
      if (
        v.status !== 'ACTIVE' ||
        HOST_TRACKED.has(v.protocol) ||
        !dt?.address ||
        !(tvlUsd >= MIN_TVL_USD)
      )
        return null;

      const chain = utils.formatChain(v.blockchain?.name?.toLowerCase());
      const apy7d = a.apy7d != null ? Number(a.apy7d) * 100 : null;
      const apy30d = a.apy30d != null ? Number(a.apy30d) * 100 : null;

      return {
        pool: `${v.address}-${chain}`,
        chain,
        project: 'sentora',
        symbol: dt.symbol,
        poolMeta: v.name,
        tvlUsd,
        apyBase: apy30d ?? apy7d ?? 0,
        ...(apy7d != null && { apyBase7d: apy7d }),
        underlyingTokens: [dt.address],
        url: v.landingUrl || 'https://vaults.sentora.com/',
      };
    })
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '6807',
  timetravel: false,
  apy,
  url: 'https://vaults.sentora.com/',
};
