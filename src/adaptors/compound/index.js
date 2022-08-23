const superagent = require('superagent');

const utils = require('../utils');

const url = 'https://api.compound.finance/api/v2/ctoken';

const apy = (entry, ethPriceUSD) => {
  entry = { ...entry };

  const totalSupply =
    Number(entry.cash.value) +
    Number(entry.reserves.value) +
    Number(entry.total_borrows.value);

  entry.totalSupplyUSD =
    totalSupply * Number(entry.underlying_price.value) * ethPriceUSD;

  entry.apyBase = entry.supply_rate.value * 100;
  entry.apyReward = Number(entry.comp_supply_apy.value);

  return entry;
};

const buildPool = (entry, chainString) => {
  // these are deprecated, dont want to include those
  // re WBTC: compound has a second WBTC token called WBTC2, which is active
  // and which we also include
  const exclude = ['cWBTC', 'cSAI', 'cREP'];
  if (!exclude.includes(entry.symbol)) {
    const newObj = {
      pool: entry.token_address,
      chain: utils.formatChain(chainString),
      project: 'compound',
      symbol: utils.formatSymbol(
        entry.symbol === 'cWBTC2' ? 'cWBTC' : entry.symbol
      ),
      tvlUsd: entry.totalSupplyUSD,
      apyBase: entry.apyBase,
      apyReward: entry.apyReward,
      rewardTokens:
        entry.apyReward > 0
          ? ['0xc00e94cb662c3520282e6f5717214004a7f26888']
          : [],
      underlyingTokens:
        entry.underlying_address === null && entry.underlying_name === 'Ether'
          ? ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2']
          : [entry.underlying_address],
    };
    return newObj;
  }
};

const topLvl = async (chainString, url) => {
  // get eth price
  const key = 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const ethPriceUSD = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [key],
    })
  ).body.coins[key].price;

  // pull data
  let data = await utils.getData(url);

  // calculate apy
  data = data.cToken.map((el) => apy(el, ethPriceUSD));

  // build pool objects
  data = data
    .map((el) => buildPool(el, chainString))
    .filter((el) => el !== undefined);

  return data;
};

const main = async () => {
  const data = await Promise.all([topLvl('ethereum', url)]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.compound.finance/',
};
