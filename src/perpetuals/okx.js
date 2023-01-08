const axios = require('axios');

const indexPrice = 'https://www.okx.com/api/v5/market/index-components';
const oi = 'https://www.okx.com/api/v5/public/open-interest?instType=SWAP';
const fr = 'https://www.okx.com/api/v5/public/funding-rate';

exports.getPerpData = async () => {
  const okxOI = (await axios.get(oi)).data.data.filter((m) =>
    m.instId.includes('-USDT-')
  );

  const frUrls = okxOI.map((p) => `${fr}?instId=${p.instId}`);
  const okxFR = (await Promise.all(frUrls.map((u) => axios.get(u))))
    .map((m) => m.data.data)
    .flat();

  const markets = [...new Set(okxFR.map((m) => m.instId.replace('-SWAP', '')))];
  const indexPrices = (
    await Promise.allSettled(
      markets.map((m) => axios.get(`${indexPrice}?index=${m}`))
    )
  )
    .filter((m) => m.status === 'fulfilled')
    .map((m) => m.value.data.data);

  return okxFR.map((p) => ({
    marketplace: 'OKX',
    market: p.instId.replace('-SWAP', ''),
    baseAsset: p.instId.split('-')[0],
    fundingRate: Number(p.nextFundingRate),
    openInterest: Number(okxOI.find((i) => i.instId === p.instId)?.oi),
    indexPrice: Number(
      indexPrices.find((i) => i.index === p.instId.replace('-SWAP', ''))?.last
    ),
  }));
};
