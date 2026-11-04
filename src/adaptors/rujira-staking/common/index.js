const BigNumber = require('bignumber.js');
const { request } = require('graphql-request');

const MAIN_API = 'https://api.rujira.network/api/graphql';
const CHAIN = 'Thorchain';
const USD_DECIMALS = 8;
const GRAPHQL_DECIMAL_PLACES = 12;
const RATE_PERCENT_DECIMALS = GRAPHQL_DECIMAL_PLACES - 2;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
const RATE_BUCKET_RETRY_DELAY_MS = 12_000;
const MAX_CONNECTION_PAGES = 20;

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
  CBBTC: 'BASE',
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

const ETHEREUM_CANONICAL_SYMBOLS = new Set(['ETH', 'USDC', 'USDT']);

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

const isTransportError = (error) =>
  !error?.response &&
  ['AbortError', 'TimeoutError', 'TypeError', 'FetchError'].includes(
    error?.name
  );

const requestGraphql = async (endpoint, query, variables) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request({
        url: endpoint,
        document: query,
        variables,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const status = error?.response?.status;
      const messages = (error?.response?.errors || [])
        .map((entry) => entry?.message)
        .filter(Boolean)
        .join(' ');
      const rateBucketFull = messages.includes('rate bucket full');
      const retryable =
        rateBucketFull ||
        status === 429 ||
        status >= 500 ||
        isTransportError(error);

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

  const normalizedSymbol = symbol.toUpperCase();
  const normalizedChain = chain.toUpperCase();
  const canonicalChain = CANONICAL_CHAINS[normalizedSymbol] || normalizedSymbol;
  return normalizedChain === 'THOR' || normalizedChain === canonicalChain
    ? symbol
    : `${symbol}.${normalizedChain}`;
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
  const seenCursors = new Set();

  for (let page = 0; page < MAX_CONNECTION_PAGES; page++) {
    const data = await requestGraphql(MAIN_API, query, { after });
    const connection = connectionAt(data);
    if (!connection?.edges || !connection.pageInfo) {
      throw new Error('Rujira GraphQL returned a malformed connection');
    }

    nodes.push(...connection.edges.map((edge) => edge?.node).filter(Boolean));

    if (!connection.pageInfo.hasNextPage) break;
    if (page === MAX_CONNECTION_PAGES - 1) {
      throw new Error('Rujira GraphQL exceeded the maximum page count');
    }

    after = connection.pageInfo.endCursor;
    if (!after) {
      throw new Error('Rujira GraphQL omitted the next page cursor');
    }
    if (seenCursors.has(after)) {
      throw new Error('Rujira GraphQL returned a repeated page cursor');
    }
    seenCursors.add(after);
  }

  return nodes;
};

module.exports = {
  CHAIN,
  MAIN_API,
  USD_DECIMALS,
  assetVariantMeta,
  encodedAssetSegment,
  fromFixed,
  getConnectionNodes,
  requestGraphql,
  toPercent,
  tokenValueUsd,
};
