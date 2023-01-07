const axios = require('axios');

const api = 'https://api.bybit.com/v2/public/tickers';

exports.getPerpData = async () => {
  const bybit = (await axios.get(api)).data.result;

  return bybit.map((p) => ({
    marketPlace: 'bybit',
    market: p.symbol,
    baseAsset: p.symbol.replace(/USDT/g, ''),
    fundingRate: Number(p.funding_rate),
    openInterest: Number(p.open_interest),
    indexPrice: Number(p.index_price),
  }));
};
