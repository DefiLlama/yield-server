const axios = require('axios');

const api = 'https://api.dydx.exchange/v3/markets';

exports.getPerpData = async () => {
  const dydx = (await axios.get(api)).data.markets;

  return Object.values(dydx).map((p) => {
    return {
      marketPlace: 'dydx',
      market: p.market,
      baseAsset: p.baseAsset,
      fundingRate: Number(p.nextFundingRate),
      openInterest: Number(p.openInterest),
      indexPrice: Number(p.indexPrice),
    };
  });
};
