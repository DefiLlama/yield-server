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

async function getExport(config) {
  const response = await fetch(getApiUrl(config.exportPath), {
    headers: HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `XOXNO ${config.chain} lending export failed: ${response.status}`
    );
  }

  return response.json();
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
    const data = await getExport(config);
    const chain = config.chain;
    const chainSlug = chain.toLowerCase();
    const hubMarkets = Array.isArray(data.hubMarkets) ? data.hubMarkets : [];
    const spokeMarkets = Array.isArray(data.spokeMarkets)
      ? data.spokeMarkets
      : [];

    // Hub markets carry the yield: liquidity + supply/borrow APY live on the
    // hub, so the same asset on two hubs is two distinct pools. poolMeta = the
    // hub name (mirrors Aave V4 "Core"/"Prime").
    for (const market of hubMarkets) {
      const tvlUsd = Number(market.tvlUsd ?? 0);
      pools.push({
        // poolId is `${hubId}-${token}` — unique per hub/asset.
        pool: `xoxno-lending-${chainSlug}-${market.poolId}`,
        chain,
        project: 'xoxno-lending',
        symbol: market.symbol,
        poolMeta: market.hubName || `Hub ${market.hubId}`,
        tvlUsd,
        apyBase: decimalToPercent(market.supplyApy),
        apyBaseBorrow: decimalToPercent(market.borrowApy),
        totalSupplyUsd: Number(market.suppliedUsd ?? 0),
        totalBorrowUsd: Number(market.borrowedUsd ?? 0),
        availableBorrowUsd: tvlUsd,
        underlyingTokens: [market.token],
        borrowToken: market.token,
        url:
          market.url ||
          `https://xoxno.com/defi/lending/hub/${market.hubId}`,
      });
    }

    // Spoke reserves are the risk/borrow-routing layer — no APY of their own
    // (that stays on the hub). Emitted as `routing_reserve` pools carrying LTV +
    // borrowability + per-spoke debt, poolMeta = "hub / spoke" (mirrors Aave V4
    // "Core / Lido"). These skip the finite/APY filter below.
    for (const spoke of spokeMarkets) {
      const pool = {
        // `${spokeId}-${hubId}-${token}` — unique per spoke/hub/asset.
        pool: `xoxno-lending-${chainSlug}-spoke-${spoke.poolId}`,
        chain,
        project: 'xoxno-lending',
        symbol: spoke.symbol,
        poolKind: 'routing_reserve',
        poolMeta: `${spoke.hubName || `Hub ${spoke.hubId}`} / ${
          spoke.spokeName || `Spoke ${spoke.spokeId}`
        }`,
        ltv: Number(spoke.ltv ?? 0),
        borrowable: Boolean(spoke.borrowable),
        routeGroupKey: String(spoke.spokeId),
        underlyingTokens: [spoke.token],
        token: null,
        url:
          spoke.url ||
          `https://xoxno.com/defi/lending/spoke/${spoke.spokeId}/hub/${spoke.hubId}/${spoke.token}?fromAsset=${spoke.token}`,
      };

      if (spoke.borrowable) {
        pool.totalBorrowUsd = Number(spoke.totalBorrowUsd ?? 0);
        pool.availableBorrowUsd = Number(spoke.availableBorrowUsd ?? 0);
        pool.borrowToken = spoke.token;
      }

      pools.push(pool);
    }
  }

  return pools.filter(
    (pool) => pool.poolKind === 'routing_reserve' || keepFinite(pool)
  );
}

module.exports = {
  protocolId: '8109',
  timetravel: false,
  apy,
  url: 'https://xoxno.com/defi/lending',
};
