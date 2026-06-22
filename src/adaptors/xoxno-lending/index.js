const API_BASE = process.env.XOXNO_LENDING_API_BASE || 'https://api.xoxno.com';
const HEADERS = { 'User-Agent': 'dune-analytics' };
const REQUEST_TIMEOUT_MS = 5_000;

const CHAIN_CONFIGS = {
  stellar: {
    chain: 'Stellar',
    exportPath: '/integrations/lending/stellar',
  },

  // Add MultiversX later with the same API response shape:
  // multiversx: {
  //   chain: 'MultiversX',
  //   exportPath: '/integrations/lending/multiversx',
  // },
};

function getApiUrl(path) {
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

async function getMarkets(config) {
  const response = await fetch(getApiUrl(config.exportPath), {
    headers: HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`XOXNO ${config.chain} lending export failed: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data.markets) ? data.markets : [];
}

function keepFinite(pool) {
  return [
    pool.tvlUsd,
    pool.apyBase,
    pool.apyBaseBorrow,
    pool.totalSupplyUsd,
    pool.totalBorrowUsd,
  ].every(Number.isFinite);
}

function decimalToPercent(value) {
  return Number(value ?? 0) * 100;
}

async function apy() {
  const pools = [];

  for (const config of Object.values(CHAIN_CONFIGS)) {
    const markets = await getMarkets(config);

    for (const market of markets) {
      pools.push({
        pool: `xoxno-lending-${config.chain.toLowerCase()}-${market.token}`,
        chain: config.chain,
        project: 'xoxno-lending',
        symbol: market.symbol,
        tvlUsd: Number(market.tvlUsd ?? 0),
        apyBase: decimalToPercent(market.supplyApy),
        apyBaseBorrow: decimalToPercent(market.borrowApy),
        totalSupplyUsd: Number(market.suppliedUsd ?? 0),
        totalBorrowUsd: Number(market.borrowedUsd ?? 0),
        underlyingTokens: [market.token],
        url: 'https://xoxno.com/defi/lending',
      });
    }
  }

  return pools.filter(keepFinite);
}

module.exports = {
  protocolId: '8049',
  timetravel: false,
  apy,
  url: 'https://xoxno.com/defi/lending',
};
