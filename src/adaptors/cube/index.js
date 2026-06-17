// Cube DEX yield adapter. Lists every enabled Cube pool with its current
// TVL, fee-derived APY (24h and 7d), volume, and underlying token mints.
//
// Data source: https://api.cubee.ee/api/defillama/yields — a small open
// REST endpoint that reads the Cube backend's on-chain swap-event
// indexer (the same indexer that drives the volume/fee adapters in
// dimension-adapters).

const utils = require('../utils');

const API_URL = 'https://api.cubee.ee/api/defillama/yields';

const apy = async () => {
  const res = await fetch(API_URL);
  const data = await res.json();
  if (!data || !Array.isArray(data.pools)) {
    throw new Error(`Cube yields API returned invalid response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const mapped = data.pools.map((p) => ({
    pool: p.pool,
    chain: 'Solana',
    project: 'cube',
    symbol: p.symbol,
    tvlUsd: p.tvlUsd,
    apyBase: p.apyBase,
    apyBase7d: p.apyBase7d,
    underlyingTokens: Array.isArray(p.underlyingTokens) ? p.underlyingTokens : [],
    volumeUsd1d: p.volumeUsd1d,
    volumeUsd7d: p.volumeUsd7d,
    poolMeta: p.poolMeta,
    url: p.url,
    token: null, // Solana mints aren't 0x… so we opt out of the EVM fallback regex
  }));

  return mapped.filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '7798',
  apy,
  url: 'https://cubee.ee',
};
