const { gql, request } = require('graphql-request');
const utils = require('../utils');
const axios = require('axios');

const HYDRATION_GRAPHQL_URL =
  'https://galacticcouncil.squids.live/hydration-pools:unified-prod/api/graphql';

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
};

// LP tokens that appear in the omnipool — map to their underlying composition
const lpUnderlyingTokens = {
  '2-Pool': ['coingecko:usd-coin', 'coingecko:tether'],
  '3-Pool': ['coingecko:aave-v3-usdt', 'coingecko:usd-coin', 'coingecko:tether'],
  '3-Pool-MRL': ['coingecko:usd-coin', 'coingecko:tether', 'coingecko:hydrated-dollar'],
};

const poolsFunction = async () => {
  try {
    // Fetch all data in parallel
    const [
      assetNodes,
      omnipoolMetrics,
      incentiveMetrics,
      omnipoolBalances,
      stableswapMetrics,
      stableswapAssets,
      stableswapBalances,
    ] = await Promise.all([
      fetchAssetSymbols(),
      fetchOmnipoolYieldMetrics(),
      fetchIncentiveMetrics(),
      fetchOmnipoolBalances(),
      fetchStableswapYieldMetrics(),
      fetchStableswapCompositions(),
      fetchStableswapBalances(),
    ]);

    // Build symbol + decimals lookup from asset registry
    const symbolMap = {};
    const decimalsMap = {};
    assetNodes.forEach((asset) => {
      if (asset.assetRegistryId) {
        symbolMap[asset.assetRegistryId] = asset.symbol;
        decimalsMap[asset.assetRegistryId] = asset.decimals;
      }
    });

    // Build incentive lookup by assetRegistryId
    const incentiveMap = {};
    incentiveMetrics.forEach((m) => {
      incentiveMap[m.id] = m;
    });

    // Get token prices for TVL calculation
    const prices = await getTokenPrices();

    // Calculate omnipool TVL using LRNA approach
    const omnipoolTvl = calculateOmnipoolTvl(omnipoolBalances, prices);

    // Track omnipool registryIds to avoid duplicating stableswap pools
    const omnipoolRegistryIds = new Set(
      omnipoolMetrics.map((m) => m.assetRegistryId)
    );

    const pools = [];

    // --- Omnipool pools ---
    for (const metric of omnipoolMetrics) {
      const regId = metric.assetRegistryId;
      let symbol = symbolMap[regId];
      if (!symbol) continue;
      symbol = cleanSymbol(symbol);
      if (!symbol) continue;

      const apyBase = parseFloat(metric.projectedApyPerc) || 0;
      const incentive = incentiveMap[regId];
      const apyReward = incentive
        ? parseFloat(incentive.incentivesApyPerc) || 0
        : 0;

      if (apyBase === 0 && apyReward === 0) continue;

      const tvlUsd = omnipoolTvl[metric.assetId] || 0;
      if (tvlUsd === 0) continue;

      const rewardTokens =
        incentive && apyReward > 0
          ? mapIncentiveTokens(incentive.incentivesTokens, symbolMap)
          : null;

      let underlyingTokens;
      if (lpUnderlyingTokens[symbol]) {
        underlyingTokens = [...new Set(lpUnderlyingTokens[symbol])];
      } else {
        const cgId = cgMapping[symbol];
        underlyingTokens = cgId ? [`coingecko:${cgId}`] : undefined;
      }

      pools.push({
        pool: `${symbol}-hydration-dex`,
        chain: 'Polkadot',
        project: 'hydration-dex',
        symbol: utils.formatSymbol(symbol),
        tvlUsd,
        apyBase: apyBase > 0 ? apyBase : null,
        apyReward: apyReward > 0 ? apyReward : null,
        rewardTokens,
        underlyingTokens,
        url: 'https://app.hydration.net/liquidity/all-pools',
        poolMeta: 'Omnipool',
      });
    }

    // --- Stableswap pools (not already in omnipool) ---
    // Build stableswap composition map: poolId -> [{assetId, registryId, symbol, decimals}]
    const stableswapComps = {};
    for (const sa of stableswapAssets) {
      if (!stableswapComps[sa.poolId]) stableswapComps[sa.poolId] = [];
      const asset = sa.asset || {};
      stableswapComps[sa.poolId].push({
        assetId: sa.assetId,
        registryId: asset.assetRegistryId,
        symbol: asset.symbol,
        decimals: asset.decimals,
      });
    }

    // Build stableswap balance map: poolId -> { assetId: freeBalance }
    const stableswapBals = {};
    for (const bal of stableswapBalances) {
      if (!stableswapBals[bal.poolId]) stableswapBals[bal.poolId] = {};
      stableswapBals[bal.poolId][bal.assetId] = bal.freeBalance;
    }

    for (const metric of stableswapMetrics) {
      const poolId = metric.poolId;

      // Skip if this stableswap LP is already represented in omnipool
      if (omnipoolRegistryIds.has(poolId)) continue;

      const composition = stableswapComps[poolId];
      if (!composition || composition.length === 0) continue;

      const apyBase = parseFloat(metric.projectedApyPerc) || 0;

      // Check for incentives on this stableswap pool
      const incentive = incentiveMap[poolId];
      const apyReward = incentive
        ? parseFloat(incentive.incentivesApyPerc) || 0
        : 0;

      if (apyBase === 0 && apyReward === 0) continue;

      // Calculate TVL from underlying asset balances
      const balances = stableswapBals[poolId] || {};
      let tvlUsd = 0;
      const underlyingTokens = [];

      for (const asset of composition) {
        const balance = balances[asset.assetId];
        if (!balance) continue;

        const sym = cleanSymbol(asset.symbol) || asset.symbol;
        const decimals = asset.decimals || 12;
        const amount = parseFloat(balance) / Math.pow(10, decimals);

        // Get price for this asset
        const cgId = cgMapping[sym];
        const price = cgId ? prices[cgId] || 0 : 0;
        tvlUsd += amount * price;

        if (cgId) underlyingTokens.push(`coingecko:${cgId}`);
      }

      if (tvlUsd === 0) continue;

      // Build symbol from composition
      const poolSymbol = composition
        .map((a) => cleanSymbol(a.symbol) || a.symbol)
        .join('-');

      const rewardTokens =
        incentive && apyReward > 0
          ? mapIncentiveTokens(incentive.incentivesTokens, symbolMap)
          : null;

      pools.push({
        pool: `stableswap-${poolId}-hydration-dex`,
        chain: 'Polkadot',
        project: 'hydration-dex',
        symbol: utils.formatSymbol(poolSymbol),
        tvlUsd,
        apyBase: apyBase > 0 ? apyBase : null,
        apyReward: apyReward > 0 ? apyReward : null,
        rewardTokens,
        underlyingTokens:
          underlyingTokens.length > 0
            ? [...new Set(underlyingTokens)]
            : undefined,
        url: 'https://app.hydration.net/liquidity/all-pools',
        poolMeta: 'Stableswap',
      });
    }

    return pools;
  } catch (error) {
    console.error('Error fetching HydraDX pools:', error);
    return [];
  }
};

// --- Data fetching functions ---

async function fetchOmnipoolYieldMetrics() {
  const query = gql`
    query {
      omnipoolAssetsYieldMetrics {
        nodes {
          assetId
          assetRegistryId
          projectedApyPerc
        }
      }
    }
  `;
  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.omnipoolAssetsYieldMetrics.nodes || [];
}

async function fetchIncentiveMetrics() {
  const query = gql`
    query {
      allAssetsYieldMetrics {
        nodes {
          id
          poolType
          feeApyPerc
          incentivesApyPerc
          incentivesTokens
        }
      }
    }
  `;
  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.allAssetsYieldMetrics.nodes || [];
}

async function fetchStableswapYieldMetrics() {
  const query = gql`
    query {
      stableswapYieldMetrics {
        nodes {
          poolId
          projectedApyPerc
        }
      }
    }
  `;
  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.stableswapYieldMetrics.nodes || [];
}

async function fetchAssetSymbols() {
  const query = gql`
    query {
      assets {
        nodes {
          assetRegistryId
          symbol
          decimals
        }
      }
    }
  `;
  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.assets.nodes || [];
}

async function fetchOmnipoolBalances() {
  const query = gql`
    query {
      omnipoolAssetHistoricalDataLatests {
        nodes {
          assetId
          freeBalance
          assetHubReserve
        }
      }
    }
  `;
  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.omnipoolAssetHistoricalDataLatests.nodes || [];
}

async function fetchStableswapCompositions() {
  const query = gql`
    query {
      stableswapAssets {
        nodes {
          poolId
          assetId
          asset {
            assetRegistryId
            symbol
            decimals
          }
        }
      }
    }
  `;
  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.stableswapAssets.nodes || [];
}

async function fetchStableswapBalances() {
  const query = gql`
    query {
      stableswapAssetHistoricalDataLatests {
        nodes {
          poolId
          assetId
          freeBalance
        }
      }
    }
  `;
  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.stableswapAssetHistoricalDataLatests.nodes || [];
}

// --- Pricing ---

// Batch-fetch token prices from coins.llama.fi
async function getTokenPrices() {
  const cgIds = [...new Set(Object.values(cgMapping))];
  const coins = cgIds.map((id) => `coingecko:${id}`).join(',');
  const res = await axios.get(
    `https://coins.llama.fi/prices/current/${coins}`
  );

  const prices = {};
  for (const [key, data] of Object.entries(res.data.coins || {})) {
    const cgId = key.replace('coingecko:', '');
    prices[cgId] = data.price;
  }
  return prices;
}

// --- TVL calculation ---

// Calculate omnipool TVL using LRNA→USD conversion
// LRNA is the hub token - each asset's assetHubReserve represents its
// value in LRNA units. We calibrate LRNA price using DOT's known USD price.
function calculateOmnipoolTvl(omnipoolBalances, prices) {
  const dotEntry = omnipoolBalances.find((d) => d.assetId === '5');
  if (!dotEntry) return {};

  const dotPrice = prices['polkadot'] || 0;
  if (dotPrice === 0) return {};

  // DOT has 10 decimals, LRNA has 12 decimals on Hydration
  const dotBalance = parseFloat(dotEntry.freeBalance) / 1e10;
  const dotUsdValue = dotBalance * dotPrice;
  const dotLrna = parseFloat(dotEntry.assetHubReserve) / 1e12;
  if (dotLrna === 0) return {};
  const lrnaPrice = dotUsdValue / dotLrna;

  const tvlByAssetId = {};
  for (const entry of omnipoolBalances) {
    const lrnaValue = parseFloat(entry.assetHubReserve) / 1e12;
    tvlByAssetId[entry.assetId] = lrnaValue * lrnaPrice;
  }

  return tvlByAssetId;
}

// --- Helpers ---

function mapIncentiveTokens(incentivesTokens, symbolMap) {
  if (
    !incentivesTokens ||
    !Array.isArray(incentivesTokens) ||
    incentivesTokens.length === 0
  ) {
    return null;
  }

  const mappedTokens = incentivesTokens
    .map((tokenId) => {
      if (tokenId === '0' || tokenId === 0) return 'HDX';
      const symbol = symbolMap[tokenId];
      return symbol ? cleanSymbol(symbol) : null;
    })
    .filter((symbol) => symbol !== null);

  const unique = [...new Set(mappedTokens)];
  return unique.length > 0 ? unique : null;
}

function cleanSymbol(symbol) {
  if (!symbol) return null;

  symbol = symbol.replace(/^2-POOL-/i, '');
  symbol = symbol.replace(/^3-POOL-/i, '');
  symbol = symbol.replace(/^4-POOL-/i, '');
  symbol = symbol.replace(/^POOL-/i, '');

  const symbolMappings = {
    TBTC: 'tBTC',
    VASTR: 'vASTR',
    VDOT: 'vDOT',
  };

  const upperSymbol = symbol.toUpperCase();
  if (symbolMappings[upperSymbol]) {
    return symbolMappings[upperSymbol];
  }

  return symbol;
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.hydration.net/liquidity/all-pools',
};
