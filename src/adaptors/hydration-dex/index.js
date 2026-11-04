const axios = require('axios');
const { ApiPromise, WsProvider } = require('@polkadot/api');
const utils = require('../utils');

// Hydration retired its GraphQL aggregator indexer in Aug 2026. Yield metrics
// now come from the Neckwork REST API (what app.hydration.net uses) and pool
// balances are read directly from chain state.
const NECKWORK_URL = 'https://hydration-api.neckwork.net';
const RPC_URL = 'wss://rpc.hydradx.cloud';
const OMNIPOOL_ACCOUNT = '7L53bUTBbfuj14UpdCNPwmgzzHSsrsTWBHX5pys32mVWM3C1';
// 30d matches the window shown on app.hydration.net and the projected APY the
// old indexer exposed.
const APY_WINDOW = '30d';
const POOL_URL = 'https://app.hydration.net/liquidity/all-pools';

// CoinGecko ID mapping for underlying token resolution and pricing
const cgMapping = {
  DAI: 'dai',
  INTR: 'interlay',
  GLMR: 'moonbeam',
  vDOT: 'voucher-dot',
  ZTG: 'zeitgeist',
  CFG: 'centrifuge',
  BNC: 'bifrost-native-coin',
  WETH: 'ethereum',
  DOT: 'polkadot',
  APE: 'apecoin',
  USDC: 'usd-coin',
  USDT: 'tether',
  ASTR: 'astar',
  WBTC: 'wrapped-bitcoin',
  iBTC: 'interbtc',
  HDX: 'hydradx',
  tBTC: 'tbtc',
  AAVE: 'aave',
  PHA: 'pha',
  vASTR: 'bifrost-voucher-astr',
  KSM: 'kusama',
  KILT: 'kilt-protocol',
  SKY: 'sky',
  LINK: 'chainlink',
  SOL: 'solana',
  GSOL: 'solana',
  CRU: 'crust-network',
  EWT: 'energy-web-token',
  UNQ: 'unique-network',
  MYTH: 'mythos',
  WUD: 'gawun-wud',
  PAXG: 'pax-gold',
  ENA: 'ethena',
  TRAC: 'origintrail',
  LDO: 'lido-dao',
  ETH: 'ethereum',
  SUI: 'sui',
  GETH: 'ethereum',
  aDOT: 'polkadot',
  aETH: 'aave-v3-weth',
  aUSDC: 'aave-v3-usdc',
  aUSDT: 'aave-v3-usdt',
  aWBTC: 'aave-v3-wbtc',
  avDOT: 'voucher-dot',
  atBTC: 'tbtc',
  wstETH: 'wrapped-steth',
  sUSDe: 'ethena-staked-usde',
  sUSDS: 'susds',
  PRIME: 'echelon-prime',
  HOLLAR: 'hydrated-dollar',
  EURC: 'euro-coin',
  aEURC: 'euro-coin',
  aPAXG: 'pax-gold',
  LBTC: 'lombard-staked-btc',
  jitoSOL: 'jito-staked-sol',
};

// --- Neckwork REST ---

const neckwork = async (path) =>
  (await axios.get(`${NECKWORK_URL}${path}`)).data.items;

// --- Chain state ---

// Stableswap pool account = blake2_256("sts" ++ u32_le(pool_id)), see
// StableswapAccountIdConstructor in galacticcouncil/hydration-node.
const stableswapPoolAccount = (api, poolId) => {
  const idBytes = new Uint8Array(4);
  new DataView(idBytes.buffer).setUint32(0, poolId, true);
  const prefix = new TextEncoder().encode('sts');
  const data = new Uint8Array(prefix.length + idBytes.length);
  data.set(prefix);
  data.set(idBytes, prefix.length);
  return api.registry.hash(data).toHex();
};

const freeBalance = async (api, assetId, account) =>
  Number((await api.call.currenciesApi.account(assetId, account)).free);

const readChainState = async (extraAssetIds = []) => {
  const api = await ApiPromise.create({
    provider: new WsProvider(RPC_URL),
    noInitWarn: true,
  });
  try {
    const [omnipoolEntries, stableswapEntries] = await Promise.all([
      api.query.omnipool.assets.entries(),
      api.query.stableswap.pools.entries(),
    ]);

    const omnipoolAssetIds = omnipoolEntries.map(([key]) =>
      key.args[0].toNumber()
    );
    const stableswapPools = stableswapEntries.map(([key, value]) => ({
      poolId: key.args[0].toNumber(),
      assetIds: value.unwrap().assets.map((a) => a.toNumber()),
    }));

    // Asset registry metadata for every asset we touch
    const assetIds = [
      ...new Set([
        ...omnipoolAssetIds,
        ...stableswapPools.flatMap((p) => [p.poolId, ...p.assetIds]),
        ...extraAssetIds,
      ]),
    ];
    const metadata = await api.query.assetRegistry.assets.multi(assetIds);
    const assets = {};
    assetIds.forEach((id, i) => {
      if (!metadata[i].isSome) return;
      const meta = metadata[i].unwrap();
      assets[id] = {
        symbol: meta.symbol.isSome ? meta.symbol.unwrap().toUtf8() : null,
        decimals: meta.decimals.isSome ? meta.decimals.unwrap().toNumber() : 12,
      };
    });

    const omnipoolBalances = {};
    await Promise.all(
      omnipoolAssetIds.map(async (id) => {
        omnipoolBalances[id] = await freeBalance(api, id, OMNIPOOL_ACCOUNT);
      })
    );

    await Promise.all(
      stableswapPools.map(async (pool) => {
        const account = stableswapPoolAccount(api, pool.poolId);
        pool.balances = {};
        await Promise.all(
          pool.assetIds.map(async (id) => {
            pool.balances[id] = await freeBalance(api, id, account);
          })
        );
        pool.totalIssuance = Number(
          await api.query.tokens.totalIssuance(pool.poolId)
        );
      })
    );

    return { assets, omnipoolAssetIds, omnipoolBalances, stableswapPools };
  } finally {
    await api.disconnect();
  }
};

// --- Pricing ---

const getTokenPrices = async () => {
  const cgIds = [...new Set(Object.values(cgMapping))];
  const coins = cgIds.map((id) => `coingecko:${id}`).join(',');
  const res = await axios.get(utils.getPriceApiUrl(`/prices/current/${coins}`));
  const prices = {};
  for (const [key, data] of Object.entries(res.data.coins || {})) {
    prices[key.replace('coingecko:', '')] = data.price;
  }
  return prices;
};

// Resolve a symbol to a coingecko id, falling back to the underlying for
// aTokens (aUSDT -> USDT) that have no mapping/price of their own.
const resolveCgId = (symbol, prices) => {
  if (!symbol) return null;
  const direct = cgMapping[symbol];
  if (direct && prices[direct] !== undefined) return direct;
  if (/^a[A-Z]/.test(symbol)) {
    const underlying = cgMapping[symbol.slice(1)];
    if (underlying && prices[underlying] !== undefined) return underlying;
  }
  return null;
};

// --- Helpers ---

const cleanSymbol = (symbol) => {
  if (!symbol) return null;
  symbol = symbol.replace(/^[234]-POOL-/i, '').replace(/^POOL-/i, '');
  const symbolMappings = { TBTC: 'tBTC', VASTR: 'vASTR', VDOT: 'vDOT' };
  return symbolMappings[symbol.toUpperCase()] || symbol;
};

const toNumber = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const poolsFunction = async () => {
  const [
    prices,
    omnipoolYield,
    stableswapYield,
    omnipoolVolume,
    stableswapVolume,
  ] = await Promise.all([
    getTokenPrices(),
    neckwork(`/v1/pools/omnipool/yield?window=${APY_WINDOW}`),
    neckwork(`/v1/pools/stableswap/yield?window=${APY_WINDOW}`),
    neckwork('/v1/pools/omnipool/volumes?period=24h'),
    neckwork('/v1/pools/stableswap/volumes?period=24h'),
  ]);

  // farm reward assets are not necessarily pool assets, so make sure their
  // registry metadata gets loaded too
  const rewardAssetIds = omnipoolYield.flatMap((m) =>
    (m.farmRewardAssets || []).map(Number)
  );
  const { assets, omnipoolAssetIds, omnipoolBalances, stableswapPools } =
    await readChainState(rewardAssetIds);

  const omnipoolYieldById = Object.fromEntries(
    omnipoolYield.map((m) => [m.assetId, m])
  );
  const stableswapYieldById = Object.fromEntries(
    stableswapYield.map((m) => [m.poolId, m])
  );
  const omnipoolVolumeById = Object.fromEntries(
    omnipoolVolume.map((m) => [m.assetId, toNumber(m.volumeUsd)])
  );
  const stableswapVolumeById = Object.fromEntries(
    stableswapVolume.map((m) => [m.poolId, toNumber(m.volumeUsd)])
  );

  const symbolOf = (id) => cleanSymbol(assets[id]?.symbol);

  // --- Stableswap pool valuation (also prices their LP tokens in omnipool) ---
  const stableswapById = {};
  for (const pool of stableswapPools) {
    let tvlUsd = 0;
    const underlyingTokens = [];
    for (const id of pool.assetIds) {
      const cgId = resolveCgId(symbolOf(id), prices);
      if (!cgId) continue;
      const decimals = assets[id]?.decimals ?? 12;
      tvlUsd += (pool.balances[id] / 10 ** decimals) * prices[cgId];
      underlyingTokens.push(`coingecko:${cgId}`);
    }
    stableswapById[pool.poolId] = {
      ...pool,
      tvlUsd,
      symbol: pool.assetIds.map((id) => symbolOf(id) || id).join('-'),
      underlyingTokens: [...new Set(underlyingTokens)],
    };
  }

  const pools = [];

  // --- Omnipool ---
  const omnipoolSet = new Set(omnipoolAssetIds);
  for (const id of omnipoolAssetIds) {
    const symbol = symbolOf(id);
    if (!symbol) continue;

    const decimals = assets[id]?.decimals ?? 12;
    const balance = omnipoolBalances[id] / 10 ** decimals;

    let tvlUsd;
    let underlyingTokens;
    const lp = stableswapById[id];
    if (lp) {
      // stableswap LP share held by the omnipool
      const share =
        lp.totalIssuance > 0 ? omnipoolBalances[id] / lp.totalIssuance : 0;
      tvlUsd = share * lp.tvlUsd;
      underlyingTokens = lp.underlyingTokens;
    } else {
      const cgId = resolveCgId(symbol, prices);
      if (!cgId) continue;
      tvlUsd = balance * prices[cgId];
      underlyingTokens = [`coingecko:${cgId}`];
    }
    if (!tvlUsd) continue;

    const metric = omnipoolYieldById[id] || {};
    const apyBase = toNumber(metric.feeApyPerc);
    const apyReward = toNumber(metric.farmAprPerc);
    if (apyBase === null && apyReward === null) continue;

    const rewardTokens =
      apyReward !== null
        ? [
            ...new Set(
              (metric.farmRewardAssets || []).map(symbolOf).filter(Boolean)
            ),
          ]
        : null;

    pools.push({
      pool: `${symbol}-hydration-dex`,
      chain: 'Polkadot',
      project: 'hydration-dex',
      symbol,
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: rewardTokens?.length ? rewardTokens : null,
      underlyingTokens,
      url: POOL_URL,
      poolMeta: 'Omnipool',
      volumeUsd1d: omnipoolVolumeById[id] ?? null,
    });
  }

  // --- Stableswap pools not already represented via the omnipool ---
  for (const pool of Object.values(stableswapById)) {
    if (omnipoolSet.has(pool.poolId)) continue;
    if (!pool.tvlUsd) continue;

    const metric = stableswapYieldById[pool.poolId] || {};
    const apyBase = toNumber(metric.feeApyPerc);
    const apyReward = toNumber(metric.farmAprPerc);
    if (apyBase === null && apyReward === null) continue;

    pools.push({
      pool: `stableswap-${pool.poolId}-hydration-dex`,
      chain: 'Polkadot',
      project: 'hydration-dex',
      symbol: pool.symbol,
      tvlUsd: pool.tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: null,
      underlyingTokens: pool.underlyingTokens.length
        ? pool.underlyingTokens
        : undefined,
      url: POOL_URL,
      poolMeta: 'Stableswap',
      volumeUsd1d: stableswapVolumeById[pool.poolId] ?? null,
    });
  }

  return pools;
};

module.exports = {
  protocolId: '3439',
  timetravel: false,
  apy: poolsFunction,
  url: POOL_URL,
};
