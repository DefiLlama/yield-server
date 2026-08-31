const API_BASE = 'https://api.xoxno.com';
const HEADERS = { 'User-Agent': 'dune-analytics' };
const REQUEST_TIMEOUT_MS = 5_000;

const CHAIN_CONFIGS = {
  stellar: {
    chain: 'Stellar',
    exportPath: '/integrations/lending/stellar',
  },
  elrond: {
    // MultiversX is listed under its former name; 'MultiversX' is not a
    // valid chain name.
    chain: 'Elrond',
    exportPath: '/integrations/lending/multiversx',
    model: 'flat',
  },
};

async function getExport(config) {
  const response = await fetch(`${API_BASE}${config.exportPath}`, {
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

    if (config.model === 'flat') {
      for (const market of Array.isArray(data.markets) ? data.markets : []) {
        const cashUsd = Number(market.tvlCashUsd ?? 0);
        pools.push({
          pool: `xoxno-lending-${chainSlug}-${market.poolId}`,
          chain,
          project: 'xoxno-lending',
          symbol: market.symbol,
          tvlUsd: cashUsd,
          apyBase: decimalToPercent(market.supplyApy),
          apyBaseBorrow: decimalToPercent(market.borrowApy),
          totalSupplyUsd: Number(market.suppliedUsd ?? 0),
          totalBorrowUsd: Number(market.borrowedUsd ?? 0),
          availableBorrowUsd: cashUsd,
          ltv: Number(market.ltv ?? 0),
          borrowable: Boolean(market.borrowable),
          underlyingTokens: [market.token],
          borrowToken: market.token,
          // No 1:1 pool token exists, and the handler's fallback only
          // recognises 0x addresses.
          token: null,
          url: market.url,
        });
      }
      continue;
    }

    const hubMarkets = Array.isArray(data.hubMarkets) ? data.hubMarkets : [];
    const spokeMarkets = Array.isArray(data.spokeMarkets)
      ? data.spokeMarkets
      : [];

    // Liquidity and APY live on the hub, so an asset on two hubs is two pools.
    for (const market of hubMarkets) {
      const tvlUsd = Number(market.tvlUsd ?? 0);
      pools.push({
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
        token: null,
        url:
          market.url ||
          `https://xoxno.com/defi/lending/hub/${market.hubId}`,
      });
    }

    // Spoke `availableBorrowUsd` is borrow-cap headroom, which routinely
    // exceeds the liquidity actually present: XLM reported $5.25M against
    // $1.5K of hub cash.
    const hubCashUsd = new Map(
      hubMarkets.map((market) => [
        `${market.hubId}-${market.token}`,
        Number(market.tvlCashUsd ?? 0),
      ])
    );

    // Spokes are the risk/routing layer with no APY of their own. Emitted as
    // `routing_reserve`, which skips the finite/APY filter below.
    for (const spoke of spokeMarkets) {
      const pool = {
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
          `https://xoxno.com/defi/lending/spoke/${spoke.spokeId}/hub/${spoke.hubId}/${spoke.token}`,
      };

      if (spoke.borrowable) {
        pool.totalBorrowUsd = Number(spoke.totalBorrowUsd ?? 0);
        pool.availableBorrowUsd = Math.min(
          Number(spoke.availableBorrowUsd ?? 0),
          hubCashUsd.get(`${spoke.hubId}-${spoke.token}`) ?? 0
        );
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
