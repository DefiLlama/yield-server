const axios = require('axios');

const api = 'https://api.bybit.com';

exports.getPerpData = async () => {
  const bybit = (await axios.get(`${api}/v2/public/tickers`)).data.result;

  const previousFRs = (
    await Promise.all(
      bybit.map((p) =>
        axios.get(
          `${api}/derivatives/v3/public/funding/history-funding-rate?symbol=${p.symbol}&limit=1`
        )
      )
    )
  )
    .map((p) => p.data.result.list)
    .flat();

  return bybit.map((p) => {
    const frP = previousFRs.find((i) => i.symbol === p.symbol);

    return {
      marketplace: 'Bybit',
      market: p.symbol,
      baseAsset: p.symbol.replace(/USDT/g, ''),
      fundingRate: Number(p.funding_rate),
      fundingRatePrevious: Number(frP?.fundingRate),
      fundingTimePrevious: Number(frP?.fundingRateTimestamp),
      openInterest: Number(p.open_interest),
      indexPrice: Number(p.index_price),
    };
  });
};
