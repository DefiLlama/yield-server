const utils = require('../utils');
const zunamiPool = '0x2ffCC661011beC72e1A9524E12060983E74D14ce';

const collectPools = async () => {
  const data = await utils.getData('https://api.zunami.io/api/zunami/info');

  return [{
    pool: zunamiPool,
    chain: utils.formatChain('ethereum'),
    project: 'zunami',
    symbol: "DAI-USDC-USDT",
    tvlUsd: data['tvl'] / 1e18,
    apy: data['apy'],
  }];
};

module.exports = {
  timetravel: false,
  apy: collectPools,
};
