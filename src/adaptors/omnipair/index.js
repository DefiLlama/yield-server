const axios = require('axios');

const API_BASE = 'https://api.indexer.omnipair.fi/api/v1';

const STABLE_ADDRESSES = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function extractPools(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const candidates = [
    payload.pools,
    payload.data,
    payload.data?.pools,
    payload.result,
    payload.result?.pools,
  ];

  const found = candidates.find(Array.isArray);
  return found || [];
}

function getAddress(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.address === 'string') return value.address;
  return null;
}

function getSymbol(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.symbol === 'string') return value.symbol;
  return null;
}

function buildSymbol(pool) {
  const token0Symbol = getSymbol(pool.token0);
  const token1Symbol = getSymbol(pool.token1);

  if (token0Symbol && token1Symbol) return `${token0Symbol}-${token1Symbol}`;
  return 'unknown';
}

function isStableToken(token) {
  const address = getAddress(token);
  const symbol = (getSymbol(token) || '').toUpperCase();

  if (address && STABLE_ADDRESSES.has(address)) return true;
  if (symbol === 'USDC' || symbol === 'USDT') return true;
  if (symbol.includes('USD')) return true;

  return false;
}

function seedTokenPrices(rawPools) {
  const tokenPrices = {};

  rawPools.forEach((pool) => {
    const token0 = pool.token0;
    const token1 = pool.token1;

    const token0Address = getAddress(token0);
    const token1Address = getAddress(token1);

    if (token0Address && isStableToken(token0)) {
      tokenPrices[token0Address] = 1;
    }

    if (token1Address && isStableToken(token1)) {
      tokenPrices[token1Address] = 1;
    }
  });

  return tokenPrices;
}

function propagateTokenPrices(rawPools, tokenPrices) {
  for (let i = 0; i < 10; i++) {
    let changed = false;

    rawPools.forEach((pool) => {
      const token0Address = getAddress(pool.token0);
      const token1Address = getAddress(pool.token1);

      const reserve0 = toNumber(pool.reserves?.token0);
      const reserve1 = toNumber(pool.reserves?.token1);

      if (!token0Address || !token1Address) return;
      if (reserve0 <= 0 || reserve1 <= 0) return;

      const price0 = tokenPrices[token0Address];
      const price1 = tokenPrices[token1Address];

      if ((price0 === undefined || price0 === null) && Number.isFinite(price1)) {
        tokenPrices[token0Address] = (reserve1 * price1) / reserve0;
        changed = true;
        return;
      }

      if ((price1 === undefined || price1 === null) && Number.isFinite(price0)) {
        tokenPrices[token1Address] = (reserve0 * price0) / reserve1;
        changed = true;
      }
    });

    if (!changed) break;
  }

  return tokenPrices;
}

function computeTvlUsd(pool, tokenPrices) {
  const token0Address = getAddress(pool.token0);
  const token1Address = getAddress(pool.token1);

  const reserve0 = toNumber(pool.reserves?.token0);
  const reserve1 = toNumber(pool.reserves?.token1);

  if (!token0Address || !token1Address) return 0;
  if (reserve0 <= 0 || reserve1 <= 0) return 0;

  const price0 = tokenPrices[token0Address];
  const price1 = tokenPrices[token1Address];

  if (!Number.isFinite(price0) || !Number.isFinite(price1)) return 0;

  return reserve0 * price0 + reserve1 * price1;
}

const main = async () => {
  const response = await axios.get(
    `${API_BASE}/pools?limit=1000&sortBy=tvl&sortOrder=desc`,
    { timeout: 30000 }
  );

  const rawPools = extractPools(response.data);

  if (!rawPools.length) {
    throw new Error('Omnipair API returned no parsable pools');
  }

  const tokenPrices = propagateTokenPrices(rawPools, seedTokenPrices(rawPools));

  const pools = rawPools
    .map((pool) => {
      const pairAddress = pool.pair_address || pool.address || pool.poolAddress;
      const token0Address = getAddress(pool.token0);
      const token1Address = getAddress(pool.token1);

      if (!pairAddress || typeof pairAddress !== 'string' || !token0Address || !token1Address) {
        return null;
      }

      return {
        pool: `${pairAddress}-solana`,
        chain: 'Solana',
        project: 'omnipair',
        symbol: buildSymbol(pool),
        tvlUsd: computeTvlUsd(pool, tokenPrices),
        apyBase: pool.apr?.apr == null ? null : toNumber(pool.apr.apr),
        underlyingTokens: [token0Address, token1Address],
      };
    })
    .filter(Boolean);

  return pools;
};

module.exports = {
  timetravel: false,
  url: 'https://docs.omnipair.fi',
  apy: main,
};