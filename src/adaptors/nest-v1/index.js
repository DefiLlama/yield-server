const utils = require('../utils');

// Your Blaze API helper endpoint (adjust host/port as needed)
const BACKEND_POOLS_URL =
  process.env.NEST_DEFI_LLAMA_POOLS_URL ||
  'https://blaze.nest.aegas.it/api/defillama/pools';

/**
 * Map backend DefiLlamaPoolDto into DefiLlama Pool interface.
 * Performs basic validation on required fields to avoid corrupted records.
 */
function mapBackendPoolToDefiLlama(pool) {
  if (!pool) return null;

  // Validate required fields
  if (!pool.pool || typeof pool.pool !== 'string') return null;
  if (!pool.chain || typeof pool.chain !== 'string') return null;
  if (!pool.symbol || typeof pool.symbol !== 'string') return null;

  const tvlUsd = Number(pool.tvlUsd);
  if (!Number.isFinite(tvlUsd) || tvlUsd <= 0) return null;

  return {
    pool: pool.pool.toLowerCase(),
    chain: utils.formatChain(pool.chain),
    project: 'nest-v1',
    symbol: utils.formatSymbol(pool.symbol),
    tvlUsd,
    apyBase:
      pool.apyBase === undefined || pool.apyBase === null
        ? null
        : Number(pool.apyBase),
    rewardTokens:
      Array.isArray(pool.rewardTokens) && pool.rewardTokens.length > 0
        ? pool.rewardTokens
        : null,
    underlyingTokens:
      Array.isArray(pool.underlyingTokens) && pool.underlyingTokens.length > 0
        ? pool.underlyingTokens
        : null,
    poolMeta: pool.poolMeta || null,
  };
}

/**
 * Main APY function required by DefiLlama.
 * Returns an array of Pool objects.
 */
const apy = async () => {
  const backendPools = await utils.getData(BACKEND_POOLS_URL);

  if (!Array.isArray(backendPools)) {
    throw new Error(
      `Expected backend to return an array, got: ${typeof backendPools}`,
    );
  }

  const pools = backendPools
    .map(mapBackendPoolToDefiLlama)
    .filter((p) => p !== null);

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.usenest.xyz/liquidity',
};