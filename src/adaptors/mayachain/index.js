const utils = require('../utils');

const chainMapping = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  THOR: 'thorchain',
  DASH: 'dash',
};

const buildPool = (entry, cacaoPrice) => {
  const asset = entry.asset.split('.');
  const chain = chainMapping[asset[0]];
  const symbol = `${asset[1].split('-')[0]}-CACAO`;

  const balanceAsset =
    (Number(entry.assetDepth) / 1e10) * Number(entry.assetPriceUSD);
  const balanceCacao = (Number(entry.runeDepth) / 1e10) * cacaoPrice;

  const newObj = {
    pool: entry.asset,
    chain: chain !== undefined ? utils.formatChain(chain) : null,
    project: 'mayachain',
    symbol: utils.formatSymbol(symbol),
    tvlUsd: balanceAsset + balanceCacao,
    apy: Number(entry.poolAPY) * 100,
  };

  return newObj;
};

const topLvl = async () => {
  // https://midgard.mayachain.info/v2/doc (for more info)
  const url = 'https://midgard.mayachain.info/v2/pools';
  let data = await utils.getData(url);
  const cacaoPrice = await utils.getData(
    'https://midgard.mayachain.info/v2/stats'
  );

  // build pool objects
  data = data.map((el) => buildPool(el, Number(cacaoPrice.cacaoPriceUSD)));

  return data.filter((p) => p.chain);
};

const main = async () => {
  const data = await topLvl();
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.eldorado.market/',
};
