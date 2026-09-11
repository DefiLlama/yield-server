const { lpTvl, feeAnnualPercent } = require('./math');

const CONTRACT = 'v2.ref-finance.near';
const INDEXER_URL = 'https://indexer.ref.finance/proxy/pool/search';

const TOKENS = {
  'dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near': 'USDT.e',
  'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near': 'USDC.e',
  '853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near': 'FRAX',
  'usdt.tether-token.near': 'USDt',
  '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': 'USDC',
};

const POOLS = [
  {
    id: '4514',
    tokens: [
      '853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near',
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    ],
  },
  {
    id: '4179',
    tokens: [
      'usdt.tether-token.near',
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      'dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near',
      'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
    ],
  },
];

const POOL_IDS = POOLS.map(({ id }) => id);
const TOKEN_IDS = [...new Set(POOLS.flatMap(({ tokens }) => tokens))];

function finiteNumber(value) {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function exactTokenSet(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  if (actualSet.size !== actual.length) return false;
  return expected.every((tokenId) => actualSet.has(tokenId));
}

function indexRows(response) {
  if (response?.code !== 0 || !Array.isArray(response?.data?.list)) {
    throw new Error('Invalid RHEA pool search response');
  }

  const rows = new Map(POOL_IDS.map((id) => [id, []]));
  for (const row of response.data.list) {
    const id = String(row?.id);
    if (rows.has(id)) rows.get(id).push(row);
  }
  return rows;
}

function buildPool(config, chainPool, indexerPool, quotes, block) {
  const tokenIds = chainPool?.token_account_ids;
  if (!exactTokenSet(tokenIds, config.tokens)) {
    throw new Error(`Unexpected token composition for pool ${config.id}`);
  }

  const poolQuotes = tokenIds.map((tokenId) => {
    const quote = quotes.get(tokenId);
    if (!quote) throw new Error(`Missing price for ${tokenId}`);
    return quote;
  });
  const tvlUsd = lpTvl(
    chainPool.amounts,
    poolQuotes.map(({ decimals }) => decimals),
    poolQuotes.map(({ price }) => price)
  );
  const indexerTvlUsd = finiteNumber(indexerPool.tvl);
  if (indexerTvlUsd === undefined || indexerTvlUsd <= 0) {
    throw new Error(`Invalid indexer TVL for pool ${config.id}`);
  }
  if (Math.abs(indexerTvlUsd - tvlUsd) / tvlUsd > 0.01) {
    console.warn('RHEA DEX TVL mismatch', {
      poolId: config.id,
      blockHeight: block.height,
      blockTimestamp: block.timestamp,
      chainAmounts: chainPool.amounts,
      quotes: tokenIds.map((tokenId, index) => ({
        tokenId,
        price: poolQuotes[index].price,
        decimals: poolQuotes[index].decimals,
      })),
      chainTvlUsd: tvlUsd,
      indexerTvlUsd,
      feeSource: {
        endpoint: INDEXER_URL,
        feeVolumeUsd24h: indexerPool.fee_volume_24h,
        volumeUsd24h: indexerPool.volume_24h,
      },
    });
    throw new Error(`TVL mismatch for pool ${config.id}`);
  }

  const apyBase = feeAnnualPercent(indexerPool.fee_volume_24h, tvlUsd);
  const volumeUsd1d = finiteNumber(indexerPool.volume_24h);
  const row = {
    pool: `rhea-dex-${CONTRACT}-${config.id}-near`,
    chain: 'NEAR',
    project: 'rhea-dex',
    symbol: tokenIds.map((tokenId) => TOKENS[tokenId]).join('-'),
    tvlUsd,
    apyBase,
    underlyingTokens: tokenIds,
    token: null,
    ...(volumeUsd1d > 0 ? { volumeUsd1d } : {}),
    url: `https://app.rhea.finance/sauce/${config.id}`,
  };
  return row;
}

async function getPools(client) {
  const block = await client.finalBlock();
  const [indexerResponse, quotes, chainResults] = await Promise.all([
    client.getJson(INDEXER_URL, { pool_id_list: POOL_IDS.join(',') }),
    client.prices(TOKEN_IDS),
    Promise.allSettled(
      POOLS.map(({ id }) =>
        client.view(CONTRACT, 'get_pool', { pool_id: Number(id) }, block.height)
      )
    ),
  ]);
  const rows = indexRows(indexerResponse);
  const failures = [];
  const pools = [];

  for (let index = 0; index < POOLS.length; index += 1) {
    const config = POOLS[index];
    const chainResult = chainResults[index];
    try {
      if (chainResult.status === 'rejected') throw chainResult.reason;
      const matches = rows.get(config.id);
      if (matches.length !== 1) {
        throw new Error(`Expected one indexer row for pool ${config.id}`);
      }
      pools.push(
        buildPool(config, chainResult.value, matches[0], quotes, block)
      );
    } catch (error) {
      failures.push(error);
    }
  }

  if (pools.length === 0) {
    throw new AggregateError(failures, 'No valid RHEA DEX pools');
  }
  return pools;
}

module.exports = { getPools };
