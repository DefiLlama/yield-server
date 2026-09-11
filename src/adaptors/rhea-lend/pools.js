const Big = require('bignumber.js');
const { lendingAmounts } = require('./math');

const CONTRACT = 'contract.main.burrow.near';
const MARKETS = [
  {
    tokenId: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    symbol: 'USDC',
  },
  { tokenId: 'usdt.tether-token.near', symbol: 'USDt' },
  {
    tokenId: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
    symbol: 'USDC.e',
  },
  {
    tokenId: 'dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near',
    symbol: 'USDT.e',
  },
  {
    tokenId: '6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near',
    symbol: 'DAI',
  },
  {
    tokenId: '853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near',
    symbol: 'FRAX',
  },
];

function borrowYield(asset) {
  if (!Object.prototype.hasOwnProperty.call(asset, 'borrow_apr')) return {};
  const raw = asset.borrow_apr;
  if (
    (typeof raw !== 'number' && typeof raw !== 'string') ||
    (typeof raw === 'string' && raw.trim() === '') ||
    (typeof raw === 'number' &&
      Number.isInteger(raw) &&
      !Number.isSafeInteger(raw))
  ) {
    throw new Error('Invalid borrow_apr');
  }
  const percent = new Big(raw).times(100);
  const apyBaseBorrow = percent.toNumber();
  if (
    !percent.isFinite() ||
    percent.lt(0) ||
    !Number.isFinite(apyBaseBorrow) ||
    (!percent.isZero() && apyBaseBorrow === 0)
  ) {
    throw new Error('Invalid borrow_apr');
  }
  return { apyBaseBorrow };
}

function hasActiveRewards(asset) {
  return (
    Array.isArray(asset.farms) &&
    asset.farms.some(
      (farm) =>
        farm?.rewards &&
        typeof farm.rewards === 'object' &&
        !Array.isArray(farm.rewards) &&
        Object.keys(farm.rewards).length > 0
    )
  );
}

async function getPools(client, diagnostic = console.warn) {
  const tokenIds = MARKETS.map(({ tokenId }) => tokenId);
  const [assets, quotes] = await Promise.all([
    client.view(CONTRACT, 'get_assets', { token_ids: tokenIds }),
    client.prices(tokenIds),
  ]);
  if (!Array.isArray(assets)) throw new Error('Invalid lending assets');
  if (!(quotes instanceof Map)) throw new Error('Invalid lending prices');

  const rows = [];
  for (const market of MARKETS) {
    try {
      const matches = assets.filter(
        (asset) => asset?.token_id === market.tokenId
      );
      if (matches.length !== 1) {
        throw new Error(
          matches.length === 0 ? 'asset missing' : 'duplicate asset'
        );
      }
      const asset = matches[0];
      if (asset.config?.can_deposit !== true) {
        throw new Error('deposit disabled');
      }
      const quote = quotes.get(market.tokenId);
      if (!quote) throw new Error('price missing');

      const row = {
        pool: `rhea-lend-${market.tokenId}-near`,
        chain: 'NEAR',
        project: 'rhea-lend',
        symbol: market.symbol,
        ...lendingAmounts(asset, quote.decimals, quote.price),
        ...borrowYield(asset),
        underlyingTokens: [market.tokenId],
        token: null,
        url: `https://app.rhea.finance/tokenDetail/${market.tokenId}?pageType=main`,
      };
      if (hasActiveRewards(asset)) {
        diagnostic(`RHEA lending ${market.symbol}: active rewards omitted`);
      }
      rows.push(row);
    } catch (error) {
      diagnostic(`RHEA lending ${market.symbol}: skipped (${error.message})`);
    }
  }
  if (rows.length === 0) throw new Error('No valid RHEA lending markets');
  return rows;
}

module.exports = { getPools };
