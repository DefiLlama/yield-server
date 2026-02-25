const { gql, request } = require('graphql-request');
const utils = require('../utils');
const axios = require('axios');

const HYDRATION_GRAPHQL_URL =
  'https://galacticcouncil.squids.live/hydration-pools:unified-prod/api/graphql';

// CoinGecko ID mapping for underlying token resolution
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
};

const poolsFunction = async () => {
  try {
    // Fetch all data in parallel
    const [assetNodes, omnipoolMetrics, incentiveMetrics, omnipoolBalances] =
      await Promise.all([
        fetchAssetSymbols(),
        fetchOmnipoolYieldMetrics(),
        fetchIncentiveMetrics(),
        fetchOmnipoolBalances(),
      ]);

    // Build symbol lookup from asset registry
    const symbolMap = {};
    assetNodes.forEach((asset) => {
      if (asset.assetRegistryId) {
        symbolMap[asset.assetRegistryId] = asset.symbol;
      }
    });

    // Build incentive lookup by assetRegistryId
    const incentiveMap = {};
    incentiveMetrics.forEach((m) => {
      incentiveMap[m.id] = m;
    });

    // Get DOT price for LRNA calibration
    const dotPrice = await getDotPrice();

    // Calculate TVL using LRNA approach
    const tvlData = calculateTvl(omnipoolBalances, omnipoolMetrics, dotPrice);

    const pools = [];

    for (const metric of omnipoolMetrics) {
      const regId = metric.assetRegistryId;
      let symbol = symbolMap[regId];
      if (!symbol) continue;
      symbol = cleanSymbol(symbol);
      if (!symbol) continue;

      // Fee APY from omnipool
      const apyBase = parseFloat(metric.projectedApyPerc) || 0;

      // Incentive APY from farming (if available)
      const incentive = incentiveMap[regId];
      const apyReward = incentive
        ? parseFloat(incentive.incentivesApyPerc) || 0
        : 0;

      // Skip pools with no yield
      if (apyBase === 0 && apyReward === 0) continue;

      // Get TVL
      const tvlUsd = tvlData[metric.assetId] || 0;
      if (tvlUsd === 0) continue;

      // Map reward tokens
      const rewardTokens =
        incentive && apyReward > 0
          ? mapIncentiveTokens(incentive.incentivesTokens, symbolMap)
          : null;

      // Resolve underlying token
      const cgId = cgMapping[symbol];
      const underlyingTokens = cgId ? [`coingecko:${cgId}`] : undefined;

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

    return pools;
  } catch (error) {
    console.error('Error fetching HydraDX pools:', error);
    return [];
  }
};

// Fetch omnipool yield metrics (fee APY for all omnipool assets)
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

// Fetch incentive/farming APY metrics
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

// Fetch asset symbols and decimals
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

// Fetch omnipool balances for TVL calculation
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

// Get DOT price from coins.llama.fi
async function getDotPrice() {
  const res = await axios.get(
    'https://coins.llama.fi/prices/current/coingecko:polkadot'
  );
  return res.data.coins['coingecko:polkadot'].price;
}

// Calculate TVL for each omnipool asset using LRNA→USD conversion
// LRNA is the hub token - each asset's assetHubReserve represents its
// value in LRNA units. We calibrate LRNA price using DOT's known USD price.
function calculateTvl(omnipoolBalances, omnipoolMetrics, dotPrice) {
  // Find DOT entry in omnipool (registryId "5", assetId "5")
  const dotEntry = omnipoolBalances.find((d) => d.assetId === '5');
  if (!dotEntry) return {};

  // DOT has 10 decimals, LRNA has 12 decimals on Hydration
  const dotBalance = parseFloat(dotEntry.freeBalance) / 1e10;
  const dotUsdValue = dotBalance * dotPrice;
  const dotLrna = parseFloat(dotEntry.assetHubReserve) / 1e12;
  const lrnaPrice = dotUsdValue / dotLrna;

  // Calculate TVL for each omnipool asset
  const tvlByAssetId = {};
  for (const entry of omnipoolBalances) {
    const lrnaValue = parseFloat(entry.assetHubReserve) / 1e12;
    tvlByAssetId[entry.assetId] = lrnaValue * lrnaPrice;
  }

  return tvlByAssetId;
}

// Helper function to map incentive token IDs to symbols
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

  // Deduplicate reward tokens
  const unique = [...new Set(mappedTokens)];
  return unique.length > 0 ? unique : null;
}

// Helper function to clean up symbol formatting
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
