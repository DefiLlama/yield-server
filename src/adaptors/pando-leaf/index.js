const axios = require('axios');
const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const URL = 'https://leaf-api.pando.im/api/cats';

// Mixin UUID -> coingecko ID mapping
const MIXIN_TO_COINGECKO = {
  'c6d0c728-2624-429b-8e0d-d9d19b6592fa': 'bitcoin',
  '43d61dcd-e413-450d-80b8-101d5e903357': 'ethereum',
  '6cfe566e-4aad-470b-8c9a-2fd35b49c68d': 'eos',
  'c94ac88f-4671-3976-b60a-09064f1811e8': 'mixin',
  '6770a1e5-6086-44d5-b60f-545f9d9e8ffd': 'dogecoin',
  'fd11b6e3-0b87-41f1-a41f-f0e9b49e5bf0': 'bitcoin-cash',
  '76c802a2-7c88-447f-a93e-c29c9e5dd9c8': 'litecoin',
  '08285081-e1d8-4be6-9edc-e203afa932da': 'filecoin',
  'c996abc9-d94e-4494-b1cf-2a3fd3ac5714': 'zcash',
  '54c61a72-b982-4034-a556-0d99e3c21e39': 'polkadot',
  'a31e847e-ca87-3162-b4d1-322bc552e831': 'uniswap',
  'eea900a8-b327-488c-8d8d-1428702fe240': 'mobilecoin',
};

async function main() {
  const response = await axios.get(URL);
  const resp =
    typeof response.data === 'string'
      ? JSON.parse(response.data)
      : response.data;
  const collaterals = resp.data.collaterals;

  // Only include collaterals with a known coingecko mapping
  const mapped = collaterals.filter((col) => MIXIN_TO_COINGECKO[col.gem]);

  // Fetch prices from coins.llama.fi for accurate TVL
  const coinKeys = [
    ...new Set(mapped.map((col) => `coingecko:${MIXIN_TO_COINGECKO[col.gem]}`)),
  ];
  const priceResp = (
    await axios.get(
      `https://coins.llama.fi/prices/current/${coinKeys.join(',')}`
    )
  ).data.coins;

  return mapped
    .map((col) => {
      const cgId = MIXIN_TO_COINGECKO[col.gem];
      const priceKey = `coingecko:${cgId}`;
      const price = priceResp[priceKey]?.price;
      if (!price) return null;

      const totalSupplyUsd = new BigNumber(col.ink).times(price).toNumber();
      // pUSD is a stablecoin pegged to $1, no coingecko listing
      const pusdPrice = 1;
      const totalBorrowUsd = new BigNumber(col.art)
        .multipliedBy(new BigNumber(col.rate))
        .times(pusdPrice)
        .toNumber();
      const ltv = 1 / Number(col.mat);
      const debtCeiling = Number(col.line) - Number(col.debt);
      const debtCeilingUsd = debtCeiling * pusdPrice;
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
        underlyingTokens: [`coingecko:${cgId}`],
        mintedCoin: 'pUSD',
      };
    })
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p));
}

// mixin
module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://pando.im/',
};
