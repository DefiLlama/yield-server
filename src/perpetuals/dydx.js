const axios = require('axios');

const api = 'https://api.dydx.exchange/v3';

exports.getPerpData = async () => {
  const dydx = Object.values((await axios.get(`${api}/markets`)).data.markets);

  const previousFRs = (
    await Promise.all(
      dydx.map((p) =>
        axios.get(`${api}/historical-funding/${p.market}?limit=1`)
      )
    )
  )
    .map((p) => p.data.historicalFunding)
    .flat();

  return dydx.map((p) => {
    const frP = previousFRs.find((i) => i.market === p.market);

    return {
      marketplace: 'dYdX',
      market: p.market,
      baseAsset: p.baseAsset,
      fundingRate: Number(p.nextFundingRate),
      fundingRatePrevious: Number(frP?.rate),
      fundingTimePrevious: new Date(frP?.effectiveAt).getTime(),
      openInterest: Number(p.openInterest),
      indexPrice: Number(p.indexPrice),
    };
  });
};
