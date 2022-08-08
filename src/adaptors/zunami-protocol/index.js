const utils = require('../utils');
const zunamiPoolEth = '0x2ffCC661011beC72e1A9524E12060983E74D14ce';
const zunamiPoolBsc = '0xFEdcBA60B3842e3F9Ed8BC56De171da5426AF8CF';

const collectPools = async () => {
  const data = await utils.getData('https://api.zunami.io/api/zunami/info');

  return [
    {
      pool: zunamiPoolEth,
      chain: utils.formatChain('ethereum'),
      project: 'zunami-protocol',
      symbol: 'DAI-USDC-USDT',
      tvlUsd: data['tvl'] / 1e18,
      apy: data['apy'],
    },
    {
      pool: zunamiPoolBsc,
      chain: utils.formatChain('binance'),
      project: 'zunami-protocol',
      symbol: 'USDT-BUSD',
      tvlUsd: data['tvl'] / 1e18,
      apy: data['apy'],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: collectPools,
};
