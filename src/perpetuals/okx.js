const axios = require('axios');

const api = 'https://www.okx.com/api/v5';

exports.getPerpData = async () => {
  const okxOI = (
    await axios.get(`${api}/public/open-interest?instType=SWAP`)
  ).data.data.filter((m) => m.instId.includes('-USDT-'));

  const frUrls = okxOI.map(
    (p) => `${api}/public/funding-rate?instId=${p.instId}`
  );
  const okxFR = (await Promise.all(frUrls.map((u) => axios.get(u))))
    .map((m) => m.data.data)
    .flat();

  const markets = [...new Set(okxFR.map((m) => m.instId.replace('-SWAP', '')))];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --- rate limited endpoints (indexPrices and historical FRs)
  const maxSize = 10;
  let indexPrices = [];
  console.log('indexPrices...');
  for (const p of [...Array(Math.ceil(markets.length / maxSize)).keys()]) {
    console.log(p);
    indexPrices.push(
      await Promise.all(
        markets
          .slice(p * maxSize, maxSize * (p + 1))
          .map((m) => axios.get(`${api}/market/index-tickers?instId=${m}`))
      )
    );
    await sleep(1000);
  }
  indexPrices = indexPrices
    .flat()
    .map((m) => m.data.data)
    .flat();

  let previusFRs = [];
  console.log('FR history...');
  for (const p of [...Array(Math.ceil(okxFR.length / maxSize)).keys()]) {
    console.log(p);
    previusFRs.push(
      await Promise.all(
        okxFR
          .map((m) => m.instId)
          .slice(p * maxSize, maxSize * (p + 1))
          .map((m) =>
            axios.get(`${api}/public/funding-rate-history?instId=${m}&limit=1`)
          )
      )
    );
    await sleep(1000);
  }
  previusFRs = previusFRs
    .flat()
    .map((m) => m.data.data)
    .flat();

  return okxFR.map((p) => {
    const frP = previusFRs.find((i) => i.instId === p.instId);

    return {
      marketplace: 'OKX',
      market: p.instId.replace('-SWAP', ''),
      baseAsset: p.instId.split('-')[0],
      fundingRate: Number(p.fundingRate),
      fundingRatePrevious: Number(frP?.fundingRate),
      fundingTimePrevious: Number(frP?.fundingTime),
      openInterest: Number(okxOI.find((i) => i.instId === p.instId)?.oiCcy),
      indexPrice: Number(
        indexPrices.find((i) => i.instId === p.instId.replace('-SWAP', ''))
          ?.idxPx
      ),
    };
  });
};
