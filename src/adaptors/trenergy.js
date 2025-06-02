const utils = require('../utils');

module.exports = {
  timetravel: false,
  apy: async () => {
    const priceData = await utils.getPrices(['tron']);
    const trxPrice = priceData['tron'].price;
    const stakedTRX = 42968491;
    const tvlUsd = stakedTRX * trxPrice;

    return [
      {
        pool: 'trenergy-trx',
        chain: 'Tron',
        project: 'trenergy',
        symbol: 'TRX',
        tvlUsd: tvlUsd,
        apyBase: 20.0, // твоя ставка
      },
    ];
  },
};
