const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');

const URL = 'https://leaf-api.pando.im/api/cats';
const PUSD_ID = 'pando-usd';

const getPrices = async (addresses) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses,
    })
  ).body.coins;

  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
};

async function main() {
  const resp = JSON.parse((await superagent.get(URL)).text);
  const collaterals = resp.data.collaterals;
  const coins = [`coingecko:${PUSD_ID}`];
  const prices = await getPrices(coins);

  return collaterals.map((col) => {
    const totalSupplyUsd = new BigNumber(col.ink).times(col.price).toNumber();
    const totalBorrowUsd = new BigNumber(col.art)
      .multipliedBy(new BigNumber(col.rate))
      .times(prices[PUSD_ID.toLowerCase()])
      .toNumber();
    const ltv = 1 / Number(col.mat);
    const debtCeiling = Number(col.line) - Number(col.debt);
    const debtCeilingUsd = debtCeiling * prices[PUSD_ID.toLowerCase()];
    return {
      pool: col.id,
      project: 'pando-leaf',
      symbol: col.name,
      chain: 'mixin',
      apy: 0,
      tvlUsd: totalSupplyUsd,
      apyBaseBorrow: Number(col.duty) * 100 - 100,
      totalSupplyUsd: totalSupplyUsd,
      totalBorrowUsd: totalBorrowUsd,
      ltv: ltv,
      debtCeilingUsd: debtCeilingUsd,
      mintedCoin: 'pUSD',
    };
  });
}

// mixin
module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://pando.im/',
};
