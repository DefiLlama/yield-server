const axios = require('axios');
const superagent = require('superagent');
const utils = require('../utils');
const USDX_ID = 'usdx';

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

const main = async () => {
  const parametersUrl = 'https://api2.kava.io/kava/cdp/v1beta1/params';
  const dispoistedUrl = 'https://api2.kava.io/kava/cdp/v1beta1/totalCollateral';
  const principalUrl = 'https://api2.kava.io/kava/cdp/v1beta1/totalPrincipal';

  const [parametersCall, dispoistedCall, principalCall] = (
    await Promise.all([
      axios.get(parametersUrl),
      axios.get(dispoistedUrl),
      axios.get(principalUrl),
    ])
  ).map((e) => e.data);

  const parameters = parametersCall.params.collateral_params.map((e) => {
    return {
      ...convertSymbol(e.denom),
      stability_fee: e.stability_fee,
      type: e.type,
      liquidation_ratio: e.liquidation_ratio,
      debt_limit: e.debt_limit.amount,
    };
  });

  const dispoisted = dispoistedCall.total_collateral.map((e) => {
    const info = convertSymbol(e.amount.denom);
    return {
      ...info,
      amount: Number(e.amount.amount / 10 ** (info?.decimals || 0)),
      type: e.collateral_type,
    };
  });

  const borrowed = principalCall.total_principal.map((e) => {
    const info = convertSymbol(e.collateral_type.split('-')[0]);
    return {
      ...info,
      amount: Number(e.amount.amount / 10 ** 6),
      type: e.collateral_type,
    };
  });

  const coins = dispoisted.map((e) => `coingecko:${e.id}`);
  const prices = await getPrices([...coins, `coingecko:${USDX_ID}`]);

  return parameters
    .filter((e) => e.id)
    .map((pool) => {
      const parameter = parameters.find((e) => e.type === pool.type);
      const collateral = dispoisted.find((e) => e.type === pool.type);
      const _borrowed = borrowed.find((e) => e.type === pool.type);
      const totalSupplyUsd = collateral.amount * prices[pool.id.toLowerCase()];
      const totalBorrowUsd = _borrowed.amount * prices[USDX_ID.toLowerCase()];
      const ltv = 1 / Number(parameter.liquidation_ratio);
      const debtCeilingUsd =
        Number(parameter.debt_limit / 10 ** 6) * prices[USDX_ID.toLowerCase()];
      return {
        pool: `${pool.id}-${pool.symbol}-${pool.type}`,
        chain: utils.formatChain('kava'),
        project: 'kava-mint',
        symbol: pool.symbol,
        tvlUsd: totalSupplyUsd,
        apy: 0,
        poolMeta: pool.type,
        apyBaseBorrow:
          pool.type === 'busd-b'
            ? 50
            : (Number(parameter.stability_fee) ** 31536000 - 1) * 100,
        totalSupplyUsd: totalSupplyUsd,
        totalBorrowUsd: totalBorrowUsd,
        ltv: ltv,
        debtCeilingUsd: debtCeilingUsd,
        mintedCoin: 'USDX',
      };
    });
};

function convertSymbol(symbol) {
  switch (symbol) {
    case 'bnb':
      return { id: 'binancecoin', decimals: 8, symbol: 'WBNB' };
    case 'btcb':
      return { id: 'bitcoin', decimals: 8, symbol: 'WBTC' };
    case 'busd':
      return { id: 'binance-usd', decimals: 8, symbol: 'BUSD' };
    case 'hard':
      return { id: 'kava-lend', decimals: 6, symbol: 'HARD' };
    case 'hbtc':
      return { id: 'bitcoin', decimals: 8, symbol: 'WBTC' };
    case 'swp':
      return { id: 'kava-swap', decimals: 6, symbol: 'SWP' };
    case 'ukava':
      return { id: 'kava', decimals: 6, symbol: 'KAVA' };
    case 'xrpb':
      return { id: 'ripple', decimals: 8, symbol: 'XRP' };
    case 'ibc/B448C0CA358B958301D328CCDC5D5AD642FC30A6D3AE106FF721DB315F3DDE5C':
      return { id: 'terra-usd', decimals: 6, symbol: 'UST' };
    case 'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2':
      return { id: 'kava-swap', decimals: 6, symbol: 'SWP' };
    default:
      console.log(symbol);
  }
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.kava.io/',
};
