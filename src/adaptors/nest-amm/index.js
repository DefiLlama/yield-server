const utils = require('../utils');

const BACKEND_POOLS_URL =
  process.env.NEST_DEFI_LLAMA_POOLS_URL ||
  'https://blaze.nest.aegas.it/api/defillama/pools';

function mapBackendPoolToDefiLlama(pool) {
  if (!pool) return null;

  if (!pool.pool || typeof pool.pool !== 'string') return null;
  if (!pool.chain || typeof pool.chain !== 'string') return null;
  if (!pool.symbol || typeof pool.symbol !== 'string') return null;

  const tvlUsd = Number(pool.tvlUsd);
  if (!Number.isFinite(tvlUsd) || tvlUsd <= 0) return null;

  return {
    pool: pool.pool.toLowerCase(),
    chain: utils.formatChain(pool.chain),
    project: 'nest-amm',
    symbol: pool.symbol,
    apyBase:
      pool.apyBase === undefined || pool.apyBase === null
        ? null
        : Number(pool.apyBase),
    apyReward:
      pool.apyReward === undefined || pool.apyReward === null
        ? null
        : Number(pool.apyReward),
    rewardTokens:
      Array.isArray(pool.rewardTokens) && pool.rewardTokens.length > 0
        ? pool.rewardTokens
        : null,
    underlyingTokens:
      Array.isArray(pool.underlyingTokens) && pool.underlyingTokens.length > 0
        ? pool.underlyingTokens
        : null,
    poolMeta: pool.poolMeta || null,
    tvlUsd,
  };
}

const apy = async () => {
  const backendPools = await utils.getData(BACKEND_POOLS_URL);

  if (!Array.isArray(backendPools)) {
    throw new Error(
      `Expected backend to return an array, got: ${typeof backendPools}`,
    );
  }

  return backendPools
    .filter((p) => p && p.poolType === 'v2')
    .map(mapBackendPoolToDefiLlama)
    .filter((p) => p !== null);
};

module.exports = {
  protocolId: '7253',
  timetravel: false,
  apy,
  url: 'https://app.usenest.xyz/liquidity',
};
