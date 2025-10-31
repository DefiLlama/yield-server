const axios = require('axios');

const INDEXER = 'https://app.neutron.org/api/indexer/v2/vaults';

// Browser-like headers to pass WAF checks
const HDRS = {
  Origin: 'https://app.neutron.org',
  Referer: 'https://app.neutron.org/earn',
  Accept: 'application/json, text/plain, */*',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
};

// Bitcoin LST Denominations (for proper symbol display)
// Maps IBC denoms to actual token symbols
const BTC_LST_DENOMS = {
  'ibc/2EB30350120BBAFC168F55D0E65551A27A724175E8FBCC7B37F9A71618FE136B': 'FBTC',
  'ibc/B7BF60BB54433071B49D586F54BD4DED5E20BEFBBA91958E87488A761115106B': 'LBTC',
  'ibc/C0F284F165E6152F6DDDA900537C1BC8DA1EA00F03B9C9EC1841FA7E004EF7A3': 'solvBTC',
  'ibc/E2A000FD3EDD91C9429B473995CE2C7C555BCC8CFC1D0A3D02F514392B7A80E8': 'eBTC',
  'ibc/1075520501498E008B02FD414CD8079C0A2BAF9657278F8FB8F7D37A857ED668': 'pumpBTC',
  'ibc/3F1D988D9EEA19EB0F3950B4C19664218031D8BCE68CE7DE30F187D5ACEA0463': 'uniBTC',
  // Base assets
  'ibc/0E293A7622DC9A6439DB60E6D234B5AF446962E27CA3AB44D0590603DFF6968E': 'wBTC',
  'ibc/694A6B26A43A2FBECCFFEAC022DEACB39578E54207FDD32005CD976B57B98004': 'ETH',
  'ibc/A585C2D15DCD3B010849B453A2CFCB5E213208A5AB665691792684C26274304D': 'ETH',
  // maxBTC factory denom
  'factory/neutron17sp75wng9vl2hu3sf4ky86d7smmk3wle9gkts2gmedn9x4ut3xcqa5xp34/maxbtc': 'maxBTC',
};

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
 * Methodology: Uses indexer-calculated vault performance over 30d window
 * - apy_vault_over_hold_30d accounts for fees earned vs. impermanent loss
 * - Already calculated by the indexer (complex CL position management)
 * - Can be negative if IL > fees earned
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

    // Use indexer-calculated APY (vault performance vs. holding over 30d)
    // This accounts for:
    // - Trading fees earned
    // - Impermanent loss from concentrated liquidity position
    // - Position rebalancing effects
    // Note: Can be negative if IL > fees
    const apyVaultOverHold = vault.apy_vault_over_hold_30d;

    // Convert from decimal to percentage (e.g., 0.05 -> 5%)
    // Set to null if not available (indexer needs time to calculate)
    let apyBase = null;
    if (apyVaultOverHold !== null && apyVaultOverHold !== undefined) {
      apyBase = Number(apyVaultOverHold) * 100;
    }

    // Extract token information with proper symbol mapping
    const token0Denom = vault.token_0_denom;
    const token1Denom = vault.token_1_denom;

    // Use mapping for BTC LSTs and known tokens, fallback to indexer symbol
    const token0Symbol = BTC_LST_DENOMS[token0Denom] || vault.token_0_symbol || '?';
    const token1Symbol = BTC_LST_DENOMS[token1Denom] || vault.token_1_symbol || '?';

    // Build underlying tokens array (filter out nullish values)
    const underlyingTokens = [token0Denom, token1Denom].filter(Boolean);

    // Construct pool URL (use vault-specific link if available, otherwise campaign page)
    const poolUrl = vault.contract_address
      ? `https://app.neutron.org/bitcoin-summer?vault=${vault.contract_address}`
      : 'https://app.neutron.org/bitcoin-summer';

    pools.push({
      pool: `${vault.contract_address}-neutron`.toLowerCase(),
      chain: 'Neutron',
      project: 'supervaults',
      symbol: `${token0Symbol}-${token1Symbol}`,
      tvlUsd,
      apyBase,
      underlyingTokens,
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
