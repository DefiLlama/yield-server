const utils = require('../utils');

const chainMapping = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  BCH: 'bitcoincash',
  BNB: 'binance',
  DOGE: 'doge',
  LTC: 'litecoin',
  TERRA: 'terra',
  GAIA: 'cosmos',
  AVAX: 'avalanche',
  BASE: 'base',
  XRP: 'ripple'
};

// Native assets without contract addresses - use coingecko IDs
const nativeCoingeckoMapping = {
  'BTC.BTC': 'coingecko:bitcoin',
  'BCH.BCH': 'coingecko:bitcoin-cash',
  'DOGE.DOGE': 'coingecko:dogecoin',
  'LTC.LTC': 'coingecko:litecoin',
  'GAIA.ATOM': 'coingecko:cosmos',
};

const resolveUnderlying = (asset, chain) => {
  // Native assets (BTC.BTC, DOGE.DOGE, etc.) - use coingecko
  if (nativeCoingeckoMapping[asset]) return nativeCoingeckoMapping[asset];

  // EVM tokens: CHAIN.TOKEN-0xAddress -> extract address
  const parts = asset.split('-');
  if (parts.length > 1 && parts[parts.length - 1].startsWith('0x')) {
    return parts[parts.length - 1];
  }

  // Fallback to raw asset notation
  return asset;
};

const buildPool = (entry, runePrice) => {
  const asset = entry.asset.split('.');
  const chain = chainMapping[asset[0]];
  const symbol = `${asset[1].split('-')[0]}-RUNE`;

  const balanceAsset =
    (Number(entry.assetDepth) / 1e8) * Number(entry.assetPriceUSD);
  const balanceRune = (Number(entry.runeDepth) / 1e8) * runePrice;

  const newObj = {
    pool: entry.asset,
    chain: chain !== undefined ? utils.formatChain(chain) : null,
    project: 'thorchain-dex',
    symbol: utils.formatSymbol(symbol),
    tvlUsd: balanceAsset + balanceRune,
    apy: Number(entry.poolAPY) * 100,
    // Resolve underlying: native assets use coingecko, EVM tokens extract address
    underlyingTokens: [resolveUnderlying(entry.asset, chain)],
  };

  return newObj;
};

const topLvl = async () => {
  // https://midgard.ninerealms.com/v2/doc (for more info)
  const url = 'https://midgard.ninerealms.com/v2/pools';
  let data = await utils.getData(url);
  const runePrice = await utils.getData(
    'https://midgard.ninerealms.com/v2/stats'
  );

  // build pool objects
  const pools = data.map((el) => buildPool(el, Number(runePrice.runePriceUSD)));

  return [...pools].filter((p) => p.chain && utils.keepFinite(p));
};

const main = async () => {
  const data = await topLvl();
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.thorswap.finance/liquidity',
};
