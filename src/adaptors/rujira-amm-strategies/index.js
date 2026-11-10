const { gql } = require('graphql-request');
const {
  CHAIN,
  assetVariantMeta,
  encodedAssetSegment,
  fromFixed,
  requestGraphql,
} = require('../rujira-staking/common');

const ANALYTICS_API = 'https://analytics.rujira.network/api/v2/graphql';
const PROJECT = 'rujira-amm-strategies';
const STRATEGY_TYPES = new Set(['CCL', 'DCL']);
const MAX_CONNECTION_PAGES = 20;

const STRATEGIES_QUERY = gql`
  query RujiraAmmYield($after: String) {
    analytics {
      products {
        amm {
          strategies(
            first: 100
            after: $after
            filter: { typeIds: ["CCL", "DCL"] }
          ) {
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              strategy {
                type {
                  id
                }
                pair {
                  contractAddress
                  baseToken {
                    id
                    symbol
                    chain {
                      id
                    }
                  }
                  quoteToken {
                    id
                    symbol
                    chain {
                      id
                    }
                  }
                }
              }
              tvl
              apr24h: apr(range: { trailing: { unit: DAY, value: 1 } })
            }
          }
        }
      }
    }
  }
`;

const readDecimal = (value, label) => {
  const amount = fromFixed(value, 0);
  if (amount === null) {
    throw new Error(`Rujira Analytics v2 returned invalid ${label}`);
  }
  return amount;
};

const readPercent = (value, label) => {
  if (value === null || value === undefined) return null;
  // Analytics financial APRs are decimal ratios, not the Main API's 1e12 units.
  const percent = readDecimal(value, label) * 100;
  if (!Number.isFinite(percent)) {
    throw new Error(`Rujira Analytics v2 returned invalid ${label}`);
  }
  return percent;
};

const tokenAsset = (token) => {
  if (
    typeof token?.id !== 'string' ||
    !token.id ||
    typeof token.symbol !== 'string' ||
    !token.symbol ||
    typeof token.chain?.id !== 'string' ||
    !token.chain.id
  ) {
    throw new Error('Rujira Analytics v2 returned incomplete token metadata');
  }

  const chain = token.chain.id.toUpperCase();
  // V2 display symbols can already include their chain (for example USDT.ETH).
  // The shared routing helpers expect the bare symbol and add variants once.
  const suffix = `.${chain}`;
  const symbol = token.symbol.toUpperCase().endsWith(suffix)
    ? token.symbol.slice(0, -suffix.length)
    : token.symbol;

  return {
    asset: token.id.toLowerCase(),
    chain,
    metadata: { symbol },
  };
};

const getStrategies = async () => {
  const rows = [];
  const seenCursors = new Set();
  let after = null;

  for (let page = 0; page < MAX_CONNECTION_PAGES; page++) {
    const data = await requestGraphql(ANALYTICS_API, STRATEGIES_QUERY, {
      after,
    });
    const connection = data?.analytics?.products?.amm?.strategies;

    if (
      !Array.isArray(connection?.nodes) ||
      typeof connection.pageInfo?.hasNextPage !== 'boolean'
    ) {
      throw new Error('Rujira Analytics v2 returned malformed AMM strategies');
    }

    rows.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) return rows;

    const cursor = connection.pageInfo.endCursor;
    if (typeof cursor !== 'string' || !cursor || seenCursors.has(cursor)) {
      throw new Error('Rujira Analytics v2 returned an invalid AMM cursor');
    }
    seenCursors.add(cursor);
    after = cursor;
  }

  throw new Error('Rujira Analytics v2 exceeded the AMM page limit');
};

const apy = async () => {
  const rows = await getStrategies();
  if (!rows.length) {
    throw new Error('Rujira Analytics v2 returned no AMM strategy data');
  }

  const pools = [];
  const seenPools = new Set();

  for (const row of rows) {
    const type = row?.strategy?.type?.id;
    if (!STRATEGY_TYPES.has(type)) {
      throw new Error('Rujira Analytics v2 returned an unexpected AMM type');
    }

    const tvlUsd = readDecimal(row.tvl, `${type} TVL`);
    if (tvlUsd < 0) {
      throw new Error('Rujira Analytics v2 returned negative AMM TVL');
    }
    // Empty strategies are not funded yield pools. DCL follows this same rule
    // and starts emitting automatically when its TVL and yield are available.
    if (tvlUsd === 0) continue;

    const apyBase = readPercent(row.apr24h, `${type} 24-hour APR`);
    if (apyBase === null) continue;

    const pair = row.strategy.pair;
    if (typeof pair?.contractAddress !== 'string' || !pair.contractAddress) {
      throw new Error('Rujira Analytics v2 omitted the FIN pair address');
    }

    const pool = `${pair.contractAddress}-${type}`.toLowerCase();
    if (seenPools.has(pool)) {
      throw new Error(`Rujira Analytics v2 returned duplicate pool ${pool}`);
    }
    seenPools.add(pool);

    const base = tokenAsset(pair.baseToken);
    const quote = tokenAsset(pair.quoteToken);
    const baseRoute = encodedAssetSegment(base);
    const quoteRoute = encodedAssetSegment(quote);
    if (!baseRoute || !quoteRoute) {
      throw new Error('Rujira Analytics v2 returned invalid pair routing');
    }

    const variants = [assetVariantMeta(base), assetVariantMeta(quote)]
      .filter(Boolean)
      .map((variant) => variant.asset);

    pools.push({
      pool,
      chain: CHAIN,
      project: PROJECT,
      symbol: `${base.metadata.symbol}-${quote.metadata.symbol}`,
      tvlUsd,
      apyBase,
      underlyingTokens: [base.asset, quote.asset],
      // CCL/DCL positions are individually owned, not a fungible LP token.
      token: null,
      poolMeta: variants.length ? `${type} (${variants.join('/')})` : type,
      url: `https://rujira.network/trade/${baseRoute}/${quoteRoute}?type=automated`,
    });
  }

  return pools;
};

module.exports = {
  protocolId: '8396',
  timetravel: false,
  apy,
  url: 'https://rujira.network/trade',
};
