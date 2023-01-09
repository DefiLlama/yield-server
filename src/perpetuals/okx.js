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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const maxSize = 10;
  let indexPrices = [];
  for (const p of [...Array(Math.ceil(markets.length / maxSize)).keys()]) {
    console.log(p);
    indexPrices.push(
      await Promise.all(
        markets
          .slice(p * maxSize, maxSize * (p + 1))
          .map((m) =>
            axios.get(
              `https://www.okx.com/api/v5/market/index-tickers?instId=${m}`
            )
          )
      )
    );
    await sleep(1000);
  }
  indexPrices = indexPrices
    .flat()
    .map((m) => m.data.data)
    .flat();

  return okxFR.map((p) => {
    const z = indexPrices.find(
      (i) => i.index === p.instId.replace('-SWAP', '')
    );

    return {
      marketplace: 'OKX',
      market: p.instId.replace('-SWAP', ''),
      baseAsset: p.instId.split('-')[0],
      fundingRate: Number(p.nextFundingRate),
      openInterest: Number(okxOI.find((i) => i.instId === p.instId)?.oiCcy),
      indexPrice: Number(
        indexPrices.find((i) => i.instId === p.instId.replace('-SWAP', ''))
          ?.idxPx
      ),
    };
  });
};
