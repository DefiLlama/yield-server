const binance = require('../perpetuals/binance');
const bybit = require('../perpetuals/bybit');
const dydx = require('../perpetuals/dydx');
const okx = require('../perpetuals/okx');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  const perps = (
    await Promise.all([
      binance.getPerpData(),
      bybit.getPerpData(),
      dydx.getPerpData(),
      okx.getPerpData(),
    ])
  ).flat();

  console.log(perps);

  return perps;
};
