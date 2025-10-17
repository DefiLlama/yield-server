const axios = require('axios');

const INDEXER = 'https://app.neutron.org/api/indexer/v2/vaults';

// Browser-like headers to pass WAF checks
const HDRS = {
  Origin: 'https://app.neutron.org',
  Referer: 'https://app.neutron.org/super-vaults',
  Accept: 'application/json, text/plain, */*',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
};

/**
 * Calculate the blended fee rate from fee tier configuration
 * @param {Array} feeTierConfig - Array of fee tiers with {fee: bps, percentage: %}
 * @returns {number} - Decimal fee rate (e.g., 0.0025 for 25 bps)
 */
function blendedFeeDecimal(feeTierConfig = []) {
  if (!Array.isArray(feeTierConfig) || feeTierConfig.length === 0) {
    return 0;
  }

  // fee is in basis points (bps); percentage is in %
  // weighted average: sum(fee * percentage / 100) in bps, then convert to decimal
  const blendedBps = feeTierConfig.reduce((acc, tier) => {
    const fee = Number(tier.fee) || 0;
    const percentage = Number(tier.percentage) || 0;
    return acc + (fee * percentage) / 100;
  }, 0);

  // Convert basis points to decimal (1 bps = 0.0001)
  return blendedBps / 10000;
}

/**
 * Fetch vaults data with retry logic to handle transient WAF/CDN issues
 * @returns {Array} - Array of vault objects
 */
async function fetchVaults() {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await axios.get(INDEXER, { headers: HDRS });
      const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
      if (rows.length) return rows;
    } catch (e) {
      lastErr = e;
      // Exponential backoff: 500ms, 1000ms, 1500ms
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr || new Error('Indexer fetch failed after retries');
}

/**
 * Main APY calculation function
 * Methodology: Conservative fee-only APY based on 24h volume
 * - Uses last 24h volume and current TVL to calculate daily yield
 * - Annualizes using simple 365x multiplication
 * - Omits points, boosts, and locked rewards per DefiLlama guidelines
 */
async function apy() {
  const vaults = await fetchVaults();
  const pools = [];

  for (const vault of vaults) {
    if (!vault) continue;

    // Skip paused vaults
    if (vault.paused) continue;

    // Skip test/inactive vaults (deposit_cap = 0 indicates test vault)
    if (
      !vault.deposit_cap ||
      vault.deposit_cap === '0' ||
      vault.deposit_cap === 0
    ) {
      continue;
    }

    // Extract TVL data (already in USD from indexer)
    const tvl0 = Number(vault.tvl_0) || 0;
    const tvl1 = Number(vault.tvl_1) || 0;
    const tvlUsd = tvl0 + tvl1;

    // Skip if no meaningful TVL
    if (tvlUsd === 0) continue;

    // Extract 24h volume (in USD)
    const volume1d = Number(vault.volume_1d) || 0;

    // Parse and calculate blended fee rate
    let feeTierConfig = [];
    try {
      feeTierConfig =
        typeof vault.fee_tier_config === 'string'
          ? JSON.parse(vault.fee_tier_config)
          : vault.fee_tier_config || [];
    } catch (e) {
      // If fee config parsing fails, assume 0 fee
      feeTierConfig = [];
    }

    const feeDecimal = blendedFeeDecimal(feeTierConfig);

    // Calculate APY: (24h_fees / TVL) * 365 * 100
    let apyBase = 0;
    if (tvlUsd > 0 && volume1d > 0 && feeDecimal > 0) {
      const dailyFeeYield = (volume1d * feeDecimal) / tvlUsd;
      apyBase = dailyFeeYield * 365 * 100; // Annualize and convert to percentage
    }

    // Extract token information
    const token0Symbol = vault.token_0_symbol || '?';
    const token1Symbol = vault.token_1_symbol || '?';
    const token0Denom = vault.token_0_denom;
    const token1Denom = vault.token_1_denom;

    // Build underlying tokens array (filter out nullish values)
    const underlyingTokens = [token0Denom, token1Denom].filter(Boolean);

    // Construct pool URL (use vault-specific link if available, otherwise campaign page)
    const poolUrl = vault.contract_address
      ? `https://app.neutron.org/bitcoin-summer?vault=${vault.contract_address}`
      : 'https://app.neutron.org/bitcoin-summer';

    // Pool metadata (can include pool_id or other identifying info)
    const poolMeta = vault.pool_id || vault.pool_address || undefined;

    pools.push({
      pool: `${vault.contract_address}-neutron`.toLowerCase(),
      chain: 'Neutron',
      project: 'supervaults',
      symbol: `${token0Symbol}-${token1Symbol}`,
      tvlUsd,
      apyBase,
      underlyingTokens,
      poolMeta,
      url: poolUrl,
    });
  }

  return pools;
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.neutron.org/bitcoin-summer',
};
