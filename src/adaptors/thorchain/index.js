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
    project: 'thorchain',
    symbol: utils.formatSymbol(symbol),
    tvlUsd: balanceAsset + balanceRune,
    apy: Number(entry.poolAPY) * 100,
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
  data = data.map((el) => buildPool(el, Number(runePrice.runePriceUSD)));

  return data.filter((p) => p.chain);
};

const main = async () => {
  const data = await topLvl();
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
};
