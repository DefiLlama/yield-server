const binance = require('../perpetuals/binance');
const bybit = require('../perpetuals/bybit');
const dydx = require('../perpetuals/dydx');
const okx = require('../perpetuals/okx');
const synthetix = require('../perpetuals/synthetix');

const { insertPerp } = require('../controllers/perpController');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  const perps = (
    await Promise.allSettled([
      binance.getPerpData(),
      bybit.getPerpData(),
      dydx.getPerpData(),
      okx.getPerpData(),
      synthetix.getPerpData(),
    ])
  )
    .filter((c) => c.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter((m) => m.indexPrice !== null)
    .map((m) => ({
      ...m,
      timestamp: new Date(Date.now()),
      market: m.market.toUpperCase(),
      baseAsset: m.baseAsset.toUpperCase(),
      fundingRate: +m.fundingRate.toFixed(10),
      fundingRatePrevious: +m.fundingRatePrevious.toFixed(10),
      fundingTimePrevious: Number(m.fundingTimePrevious),
      indexPrice: +m.indexPrice.toFixed(5),
      openInterest: Math.round(m.openInterest),
    }))
    .filter((m) => m.indexPrice >= 0);

  const r = await insertPerp(perps);
  console.log(r);
};
