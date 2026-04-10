const axios = require('axios');

const API_BASE = 'https://api.indexer.omnipair.fi/api/v1';

function toNumber(value) {
  if (value === null || value === undefined) return 0;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (typeof value === 'object') {
    const candidates = [
      value.usd,
      value.value,
      value.amount,
      value.total,
    ];

    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return 0;
}

function getAddress(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.address === 'string') {
    return value.address;
  }
  return null;
}

function getSymbol(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.symbol === 'string') {
    return value.symbol;
  }
  return null;
}

function extractPools(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const candidates = [
    payload.pools,
    payload.pairs,
    payload.items,
    payload.results,
    payload.data,
    payload.data?.pools,
    payload.data?.pairs,
    payload.data?.items,
    payload.data?.results,
    payload.result,
    payload.result?.pools,
    payload.result?.pairs,
    payload.result?.items,
    payload.result?.results,
  ];

  const found = candidates.find(Array.isArray);
  return found || [];
}

function normalizeUnderlyingTokens(pool) {
  if (Array.isArray(pool.underlyingTokens)) {
    const tokens = pool.underlyingTokens
      .map((token) => getAddress(token))
      .filter(Boolean);

    if (tokens.length) return tokens;
  }

  const token0 =
    getAddress(pool.token0) ||
    getAddress(pool.token0Address) ||
    getAddress(pool.token0_address) ||
    getAddress(pool.token0Mint) ||
    getAddress(pool.token0_mint);

  const token1 =
    getAddress(pool.token1) ||
    getAddress(pool.token1Address) ||
    getAddress(pool.token1_address) ||
    getAddress(pool.token1Mint) ||
    getAddress(pool.token1_mint);

  return [token0, token1].filter(Boolean);
}

function normalizeLpToken(pool) {
  const candidates = [
    pool.lpMint,
    pool.lp_mint,
    pool.lpToken,
    pool.lp_token,
    pool.token,
  ];

  for (const candidate of candidates) {
    const address = getAddress(candidate);
    if (address) return address;
  }

  return null;
}

function buildSymbol(pool) {
  if (typeof pool.symbol === 'string' && pool.symbol.length) {
    return pool.symbol;
  }

  const token0Symbol =
    pool.token0Symbol ||
    pool.token0_symbol ||
    pool.symbol0 ||
    getSymbol(pool.token0) ||
    getSymbol(pool.underlyingTokens?.[0]);

  const token1Symbol =
    pool.token1Symbol ||
    pool.token1_symbol ||
    pool.symbol1 ||
    getSymbol(pool.token1) ||
    getSymbol(pool.underlyingTokens?.[1]);

  if (token0Symbol && token1Symbol) {
    return `${token0Symbol}-${token1Symbol}`;
  }

  return 'unknown';
}

function extractTvlUsd(pool) {
  return toNumber(
    pool.tvlUsd ??
      pool.tvl_usd ??
      pool.tvl ??
      pool.totalTvl ??
      pool.total_tvl ??
      pool.metrics?.tvlUsd ??
      pool.metrics?.tvl ??
      pool.stats?.tvlUsd ??
      pool.stats?.tvl
  );
}

function extractApyBase(pool) {
  return toNumber(
    pool.apyBase ??
      pool.apy_base ??
      pool.apy ??
      pool.apr ??
      pool.metrics?.apyBase ??
      pool.metrics?.apy_base ??
      pool.metrics?.apy ??
      pool.metrics?.apr ??
      pool.stats?.apyBase ??
      pool.stats?.apy ??
      pool.stats?.apr
  );
}

const main = async () => {
  const response = await axios.get(
    `${API_BASE}/pools?limit=1000&sortBy=tvl&sortOrder=desc`,
    { timeout: 30000 }
  );

  const rawPools = extractPools(response.data);

  if (!rawPools.length) {
    console.log(
      'omnipair payload preview:',
      JSON.stringify(response.data, null, 2).slice(0, 2000)
    );
    throw new Error('Omnipair API returned no parsable pools');
  }

  const pools = rawPools
    .map((pool) => {
      const pairAddress =
        getAddress(pool.address) ||
        getAddress(pool.poolAddress) ||
        getAddress(pool.pairAddress) ||
        getAddress(pool.pair_address) ||
        getAddress(pool.id);

      if (!pairAddress) return null;

      const underlyingTokens = normalizeUnderlyingTokens(pool);
      const token = normalizeLpToken(pool);

      const out = {
        pool: `${pairAddress.toLowerCase()}-solana`,
        chain: 'Solana',
        project: 'omnipair',
        symbol: buildSymbol(pool),
        tvlUsd: extractTvlUsd(pool),
        apyBase: extractApyBase(pool),
        underlyingTokens,
      };

      if (token) {
        out.token = token;
      }

      return out;
    })
    .filter(Boolean);

  if (!pools.length) {
    console.log(
      'omnipair first raw pool preview:',
      JSON.stringify(rawPools[0], null, 2).slice(0, 2000)
    );
    throw new Error('Omnipair pools were returned, but none could be normalized');
  }

  return pools;
};

module.exports = {
  timetravel: false,
  url: 'https://docs.omnipair.fi',
  apy: main,
};