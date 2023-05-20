const utils = require('../utils');
const zunamiPoolEth = '0x2ffCC661011beC72e1A9524E12060983E74D14ce';
const zunamiPoolBsc = '0xFEdcBA60B3842e3F9Ed8BC56De171da5426AF8CF';
const zunamiPoolPolygon = '0x8141d8f73c837acab6F4736Cc51143E002985Cf5';
const zunamiApsEth = '0xCaB49182aAdCd843b037bBF885AD56A3162698Bd';

const collectPools = async () => {
  const data = await utils.getData('https://api.zunami.io/api/v2/zunami/info');
  const info = data['info'];
  const omnipool = info['omnipool'];
  const aps = info['aps'];
  return [
    {
      pool: zunamiPoolEth,
      chain: utils.formatChain('ethereum'),
      project: 'zunami-protocol',
      symbol: 'DAI-USDC-USDT',
      tvlUsd: omnipool['tvl'] / 1e18,
      apy: omnipool['apy'],
    },
    {
      pool: zunamiPoolBsc,
      chain: utils.formatChain('binance'),
      project: 'zunami-protocol',
      symbol: 'USDT-BUSD',
      tvlUsd: omnipool['bscTvl'] / 1e18,
      apy: omnipool['apy'],
    },
    {
      pool: zunamiPoolPolygon,
      chain: utils.formatChain('polygon'),
      project: 'zunami-protocol',
      symbol: 'USDT',
      tvlUsd: omnipool['maticTvl'] / 1e18,
      apy: omnipool['apy'],
    },
    {
      pool: zunamiApsEth,
      chain: utils.formatChain('ethereum'),
      project: 'zunami-protocol',
      symbol: 'UZD',
      tvlUsd: aps['tvl'] / 1e18,
      apy: aps['apy'],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: collectPools,
  url: 'https://app.zunami.io/',
};
