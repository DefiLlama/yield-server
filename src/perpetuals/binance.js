const axios = require('axios');

const api = 'https://fapi.binance.com/fapi/v1';

exports.getPerpData = async () => {
  let fr = (await axios.get(`${api}/premiumIndex`)).data;
  // remove futures
  fr = fr?.filter((m) => !m.symbol.includes('_'));

  const oiUrls = fr?.map((p) => `${api}/openInterest?symbol=${p.symbol}`);
  const oi = (await Promise.allSettled(oiUrls.map((u) => axios.get(u))))
    .filter((m) => m.status === 'fulfilled')
    .map((m) => m.value.data);

  return oi.map((m) => {
    const frM = fr.find((i) => i.symbol === m.symbol);

    return {
      marketplace: 'Binance',
      market: m.symbol,
      baseAsset: m.symbol.replace(/USDT|BUSD/g, ''),
      fundingRate: Number(frM?.lastFundingRate) ?? null,
      openInterest: Number(m.openInterest),
      indexPrice: Number(frM?.indexPrice),
    };
  });
};
