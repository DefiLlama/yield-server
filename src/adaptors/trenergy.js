const utils = require('../../utils');

module.exports = {
  timetravel: false,
  apy: async () => {
    const price = await utils.getPrices(['tron']);
    const trxPrice = price['tron'].price;

    //TRX Stacked
    const totalTRX = 168153490;

    return [
      {
        pool: 'trenergy-trx',
        chain: 'Tron',
        project: 'trenergy',
        symbol: 'TRX',
        tvlUsd: totalTRX * trxPrice,
        apyBase: 18.36, // APY Average per 1 Year
      },
    ];
  },
};
