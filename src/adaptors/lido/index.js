const utils = require('../utils');

const topLvl = async () => {
  const [tvlData, apyData] = await Promise.all([
    utils.getData('https://eth-api.lido.fi/v1/protocol/steth/stats'),
    utils.getData('https://eth-api.lido.fi/v1/protocol/steth/apr/last'),
  ]);

  return {
    pool: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84-ethereum',
    chain: utils.formatChain('ethereum'),
    project: 'lido',
    symbol: utils.formatSymbol('stETH'),
    tvlUsd: tvlData.marketCap,
    apyBase: Number(apyData.data.apr),
    underlyingTokens: ['0x0000000000000000000000000000000000000000'],
  };
};

const main = async () => [await topLvl()];

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://lido.fi/#networks',
};
