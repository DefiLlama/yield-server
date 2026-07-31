const axios = require('axios');
const utils = require('../utils');

// Sentora's own canonical vault registry (Smart Vaults + curated Morpho/Euler/
// Kamino vaults). Each vault carries an `analytics` block with tvlUsd and
// apy7d/apy30d. TVL is verifiable on-chain (erc4626 totalAssets / upshift
// getTotalAssets / kamino api), spot-checked and matches. Reshaping this means
// new vaults (e.g. the mWIN Morpho vault) appear automatically once Sentora
// adds them to their API, no code change needed.
const API = 'https://services.vaults.sentora.com/vaults';
const MIN_TVL_USD = 1000; // drop dust/seed vaults

const apy = async () => {
  const { data } = await axios.get(API);
  const vaults = Array.isArray(data) ? data : data.vaults || data.data || [];

  return vaults
    .map((v) => {
      const a = v.analytics;
      const dt = v.depositToken;
      const tvlUsd = Number(a?.tvlUsd);
      if (v.status !== 'ACTIVE' || !dt?.address || !(tvlUsd >= MIN_TVL_USD))
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
