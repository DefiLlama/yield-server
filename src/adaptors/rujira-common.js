const BigNumber = require('bignumber.js');
const { gql, request } = require('graphql-request');

const MAIN_API = 'https://api.rujira.network/api/graphql';
const ANALYTICS_API = 'https://analytics.rujira.network/api/graphql';
const CHAIN = 'Thorchain';
const USD_DECIMALS = 8;
const GRAPHQL_DECIMAL_PLACES = 12;
// Rujira rates are 12-decimal ratios; shifting by 10 returns percentage points.
const RATE_PERCENT_DECIMALS = GRAPHQL_DECIMAL_PLACES - 2;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
const RATE_BUCKET_RETRY_DELAY_MS = 12_000;

const PROJECTS = {
  staking: 'rujira-staking',
  moneyMarket: 'rujira-money-market',
  ccl: 'rujira-amm-strategies',
};

const STAKING_SYMBOLS = new Set(['RUJI', 'BRUNE', 'TCY']);
const ETHEREUM_CANONICAL_SYMBOLS = new Set(['ETH', 'USDC', 'USDT']);

const SOURCE_CHAIN_LABELS = {
  AVAX: 'Avalanche',
  BASE: 'Base',
  BSC: 'BSC',
  TRON: 'Tron',
};

const CANONICAL_CHAINS = {
  AAVE: 'ETH',
  ATOM: 'GAIA',
  BNB: 'BSC',
  cbBTC: 'BASE',
  DAI: 'ETH',
  FOX: 'ETH',
  GUSD: 'ETH',
  LINK: 'ETH',
  LUSD: 'ETH',
  TGT: 'ETH',
  THOR: 'ETH',
  USDC: 'ETH',
  USDT: 'ETH',
  USDP: 'ETH',
  VTHOR: 'ETH',
  WBTC: 'ETH',
  YFI: 'ETH',
};

const STAKING_QUERY = gql`
  query RujiraStakingYield {
    staking {
      pools {
        address
        bondAsset {
          metadata {
            symbol
          }
          variants {
            native {
              denom
            }
          }
        }
        receiptAsset {
          variants {
            native {
              denom
            }
          }
        }
        status {
          valueUsd
        }
        summary {
          apy {
            status
            value
          }
        }
      }
    }
  }
`;

const GHOST_VAULTS_QUERY = gql`
  query RujiraGhostVaults($after: String) {
    strategies(
      first: 200
      after: $after
      typenames: ["GhostVault"]
      sortBy: NAME
      sortDir: ASC
    ) {
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          ... on GhostVault {
            address
            asset {
              chain
              metadata {
                decimals
                symbol
              }
              price {
                current
              }
              variants {
                native {
                  denom
                }
              }
            }
            status {
              debtPool {
                size
              }
              debtRate
              depositPool {
                size
              }
              lendRate
            }
          }
        }
      }
    }
  }
`;

const GHOST_CREDIT_QUERY = gql`
  query RujiraGhostCreditVaults {
    ghostCredit {
      vaults {
        borrower {
          available
          current
          limit
          vault {
            address
          }
        }
      }
    }
  }
`;

const FIN_PAIRS_QUERY = gql`
  query RujiraFinPairs($after: String) {
    finV3 {
      pairs(first: 200, after: $after, sortBy: NAME, sortDir: ASC) {
        pageInfo {
          endCursor
          hasNextPage
        }
        edges {
          node {
            address
            assetBase {
              chain
              metadata {
                symbol
              }
              variants {
                native {
                  denom
                }
              }
            }
            assetQuote {
              chain
              metadata {
                symbol
              }
              variants {
                native {
                  denom
                }
              }
            }
          }
        }
      }
    }
  }
`;

const CCL_QUERY = gql`
  query RujiraCclYield {
    finV3 {
      rangeAprSummary(limit: 500, status: OPEN) {
        contract
        yieldApr
        totalValueUsd
      }
    }
  }
`;

const fromFixed = (value, decimals) => {
  if (value === null || value === undefined) return null;

  const result = new BigNumber(String(value)).shiftedBy(-decimals);
  if (!result.isFinite()) return null;

  const number = result.toNumber();
  return Number.isFinite(number) ? number : null;
};

const tokenValueUsd = (amount, price, decimals) => {
  if (amount === null || amount === undefined || price == null) return null;

  const result = new BigNumber(String(amount))
    .shiftedBy(-decimals)
    .times(String(price))
    .shiftedBy(-GRAPHQL_DECIMAL_PLACES);

  if (!result.isFinite()) return null;
  const number = result.toNumber();
  return Number.isFinite(number) ? number : null;
};

const toPercent = (value) => fromFixed(value, RATE_PERCENT_DECIMALS);

const requestGraphql = async (endpoint, query, variables) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request(endpoint, query, variables);
    } catch (error) {
      const status = error?.response?.status;
      const messages = (error?.response?.errors || [])
        .map((entry) => entry?.message)
        .filter(Boolean)
        .join(' ');
      const rateBucketFull = messages.includes('rate bucket full');
      const retryable = status === 429 || status >= 500 || rateBucketFull;

      if (!retryable || attempt === RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          rateBucketFull ? RATE_BUCKET_RETRY_DELAY_MS : RETRY_DELAYS_MS[attempt]
        )
      );
    }
  }
};

const assetUrlSegment = (asset) => {
  const symbol = asset?.metadata?.symbol;
  const chain = asset?.chain;
  if (!symbol || !chain) return null;

  const canonicalChain = CANONICAL_CHAINS[symbol] || symbol.toUpperCase();
  return chain === 'THOR' || chain === canonicalChain
    ? symbol
    : `${symbol}.${chain}`;
};

const assetVariantMeta = (asset) => {
  const symbol = asset?.metadata?.symbol;
  const chain = asset?.chain;
  if (
    !symbol ||
    !chain ||
    !ETHEREUM_CANONICAL_SYMBOLS.has(symbol.toUpperCase()) ||
    chain === 'ETH'
  ) {
    return null;
  }

  return {
    chain: SOURCE_CHAIN_LABELS[chain] || chain,
    asset: assetUrlSegment(asset),
  };
};

const encodedAssetSegment = (asset) => {
  const segment = assetUrlSegment(asset);
  return segment ? encodeURIComponent(segment) : null;
};

const getConnectionNodes = async (query, connectionAt) => {
  const nodes = [];
  let after = null;

  do {
    const data = await requestGraphql(MAIN_API, query, { after });
    const connection = connectionAt(data);
    if (!connection?.edges || !connection.pageInfo) {
      throw new Error('Rujira GraphQL returned a malformed connection');
    }

    nodes.push(...connection.edges.map((edge) => edge?.node).filter(Boolean));

    if (!connection.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) {
      throw new Error('Rujira GraphQL omitted the next page cursor');
    }
  } while (after);

  return nodes;
};

const getStakingPools = async () => {
  const data = await requestGraphql(MAIN_API, STAKING_QUERY);
  const pools = data?.staking?.pools;
  if (!Array.isArray(pools)) {
    throw new Error('Rujira GraphQL returned malformed staking data');
  }

  return pools
    .map((pool) => {
      const symbol = pool?.bondAsset?.metadata?.symbol;
      const normalizedSymbol = symbol?.toUpperCase();
      if (!STAKING_SYMBOLS.has(normalizedSymbol)) return null;

      const tvlUsd = fromFixed(pool?.status?.valueUsd, USD_DECIMALS);
      const apyBase =
        pool?.summary?.apy?.status === 'AVAILABLE'
          ? toPercent(pool.summary.apy.value)
          : null;
      const underlying = pool?.bondAsset?.variants?.native?.denom;
      const token = pool?.receiptAsset?.variants?.native?.denom;
      const route = encodedAssetSegment({
        chain: 'THOR',
        metadata: { symbol },
      });

      if (
        !pool?.address ||
        !symbol ||
        !underlying ||
        !token ||
        !route ||
        tvlUsd === null ||
        tvlUsd < 0 ||
        apyBase === null
      ) {
        return null;
      }

      return {
        pool: pool.address.toLowerCase(),
        chain: CHAIN,
        project: PROJECTS.staking,
        symbol,
        tvlUsd,
        apyBase,
        underlyingTokens: [underlying],
        token,
        poolMeta: 'Staking',
        url: `https://rujira.network/stake/${route}`,
      };
    })
    .filter(Boolean);
};

const getGhostVaults = () =>
  getConnectionNodes(GHOST_VAULTS_QUERY, (data) => data?.strategies);

const getMoneyMarketPools = async () => {
  const [vaults, creditData] = await Promise.all([
    getGhostVaults(),
    requestGraphql(MAIN_API, GHOST_CREDIT_QUERY),
  ]);

  const creditEntries = creditData?.ghostCredit?.vaults;
  if (!Array.isArray(creditEntries)) {
    throw new Error('Rujira GraphQL returned malformed credit vault data');
  }

  const creditVaults = new Map(
    creditEntries
      .map((entry) => entry?.borrower)
      .filter((borrower) => borrower?.vault?.address)
      .map((borrower) => [borrower.vault.address, borrower])
  );

  return vaults
    .map((vault) => {
      const asset = vault?.asset;
      const status = vault?.status;
      const decimals = asset?.metadata?.decimals;
      const symbol = asset?.metadata?.symbol;
      const underlying = asset?.variants?.native?.denom;
      const route = encodedAssetSegment(asset);
      const variantMeta = assetVariantMeta(asset);
      const borrower = creditVaults.get(vault?.address);

      if (
        !vault?.address ||
        !Number.isInteger(decimals) ||
        !symbol ||
        !underlying ||
        !route
      ) {
        return null;
      }

      const totalSupplyUsd = tokenValueUsd(
        status?.depositPool?.size,
        asset?.price?.current,
        decimals
      );
      const totalBorrowUsd = tokenValueUsd(
        status?.debtPool?.size,
        asset?.price?.current,
        decimals
      );
      const apyBase = toPercent(status?.lendRate);
      const apyBaseBorrow = borrower ? toPercent(status?.debtRate) : null;
      const availableBorrowUsd = borrower
        ? tokenValueUsd(borrower.available, asset?.price?.current, decimals)
        : null;

      if (
        totalSupplyUsd === null ||
        totalBorrowUsd === null ||
        totalSupplyUsd < totalBorrowUsd ||
        apyBase === null ||
        (borrower &&
          (apyBaseBorrow === null ||
            availableBorrowUsd === null ||
            availableBorrowUsd < 0))
      ) {
        return null;
      }

      const tvlUsd = totalSupplyUsd - totalBorrowUsd;
      const token = `x/ghost-vault/${underlying}`;
      const borrowable = Boolean(
        borrower && new BigNumber(String(borrower.available)).isGreaterThan(0)
      );

      return {
        pool: vault.address.toLowerCase(),
        chain: CHAIN,
        project: PROJECTS.moneyMarket,
        symbol,
        tvlUsd,
        apyBase,
        ...(borrower && {
          apyBaseBorrow,
          availableBorrowUsd,
        }),
        totalSupplyUsd,
        totalBorrowUsd,
        borrowToken: underlying,
        borrowable,
        underlyingTokens: [underlying],
        token,
        poolMeta: variantMeta
          ? `Money Market (${variantMeta.chain})`
          : 'Money Market',
        url: `https://rujira.network/lend/${route}`,
      };
    })
    .filter(Boolean);
};

const getFinPairs = () =>
  getConnectionNodes(FIN_PAIRS_QUERY, (data) => data?.finV3?.pairs);

const getCclPools = async () => {
  const [analyticsData, pairs] = await Promise.all([
    requestGraphql(ANALYTICS_API, CCL_QUERY),
    getFinPairs(),
  ]);

  const summaries = analyticsData?.finV3?.rangeAprSummary;
  if (!Array.isArray(summaries)) {
    throw new Error('Rujira GraphQL returned malformed CCL data');
  }

  const pairsByAddress = new Map(
    pairs.filter((pair) => pair?.address).map((pair) => [pair.address, pair])
  );

  return summaries
    .map((summary) => {
      const pair = pairsByAddress.get(summary?.contract);
      const base = pair?.assetBase;
      const quote = pair?.assetQuote;
      const baseSymbol = base?.metadata?.symbol;
      const quoteSymbol = quote?.metadata?.symbol;
      const baseToken = base?.variants?.native?.denom;
      const quoteToken = quote?.variants?.native?.denom;
      const baseRoute = encodedAssetSegment(base);
      const quoteRoute = encodedAssetSegment(quote);
      const variantLabels = [assetVariantMeta(base), assetVariantMeta(quote)]
        .filter(Boolean)
        .map((variant) => variant.asset);
      const tvlUsd = fromFixed(summary?.totalValueUsd, USD_DECIMALS);
      const apyBase = toPercent(summary?.yieldApr);

      if (
        !summary?.contract ||
        !baseSymbol ||
        !quoteSymbol ||
        !baseToken ||
        !quoteToken ||
        !baseRoute ||
        !quoteRoute ||
        tvlUsd === null ||
        tvlUsd < 0 ||
        apyBase === null
      ) {
        return null;
      }

      return {
        pool: summary.contract.toLowerCase(),
        chain: CHAIN,
        project: PROJECTS.ccl,
        symbol: `${baseSymbol}-${quoteSymbol}`,
        tvlUsd,
        apyBase,
        underlyingTokens: [baseToken, quoteToken],
        poolMeta: variantLabels.length
          ? `CCL (${variantLabels.join('/')})`
          : 'CCL',
        url: `https://rujira.network/trade/${baseRoute}/${quoteRoute}?type=automated`,
      };
    })
    .filter(Boolean);
};

module.exports = {
  getCclPools,
  getMoneyMarketPools,
  getStakingPools,
};
