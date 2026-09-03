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

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

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

// DefiLlama prices native EGLD under the null address; `elrond:EGLD` resolves
// to nothing. Same mapping as the TVL adapter.
function priceToken(chainSlug, token) {
  return chainSlug === 'elrond' && token === 'EGLD' ? NULL_ADDRESS : token;
}

// An asset's state lives on the hub, so that is what a spoke row points back
// at. Hub `poolId` is already this pair.
function hubKey(hubId, token) {
  return `${hubId}-${token}`;
}

async function getChainPools(config) {
  const data = await getExport(config);
  const chain = config.chain;
  const chainSlug = chain.toLowerCase();
  const pools = [];

  if (config.model === 'flat') {
    for (const market of Array.isArray(data.markets) ? data.markets : []) {
      const cashUsd = Number(market.tvlCashUsd ?? 0);
      const token = priceToken(chainSlug, market.token);
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
        underlyingTokens: [token],
        borrowToken: token,
        // No 1:1 pool token exists, and the handler's fallback only
        // recognises 0x addresses.
        token: null,
        url: market.url,
      });
    }

    return pools;
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
      underlyingStateKey: hubKey(market.hubId, market.token),
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
        market.url || `https://xoxno.com/defi/lending/hub/${market.hubId}`,
    });
  }

  // Spoke `availableBorrowUsd` is borrow-cap headroom, which routinely
  // exceeds the liquidity actually present: XLM reported $5.25M against
  // $1.5K of hub cash.
  const hubCashUsd = new Map(
    hubMarkets.map((market) => [
      hubKey(market.hubId, market.token),
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
      // Spoke ids restart at 1 per chain, so the group key is namespaced.
      routeGroupKey: `${chainSlug}-${spoke.spokeId}`,
      underlyingStateKey: hubKey(spoke.hubId, spoke.token),
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
        hubCashUsd.get(hubKey(spoke.hubId, spoke.token)) ?? 0
      );
      pool.borrowToken = spoke.token;
    }

    pools.push(pool);
  }

  return pools;
}

async function apy() {
  // One chain's outage must not drop the other's pools.
  const results = await Promise.allSettled(
    Object.values(CHAIN_CONFIGS).map((config) => getChainPools(config))
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(`xoxno-lending: ${result.reason}`);
    }
  }

  return results
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .filter((pool) => pool.poolKind === 'routing_reserve' || keepFinite(pool));
}

module.exports = {
  protocolId: '8109',
  timetravel: false,
  apy,
  url: 'https://xoxno.com/defi/lending',
};
