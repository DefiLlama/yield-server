const utils = require('../utils');

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://analytics.ousd.com/api/v1/apr/trailing'
  );
  const dataTvl = await utils.getData('https://api.llama.fi/tvl/origin-dollar');

  const ousd = {
    pool: 'origin-dollar',
    chain: 'Ethereum',
    project: 'origin-dollar',
    symbol: 'OUSD',
    tvlUsd: dataTvl.tvl,
    apy: Number(apyData.apy),
    underlyingTokens: [
      '0xdac17f958d2ee523a2206206994597c13d831ec7',
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      '0x6b175474e89094c44da98b954eedeac495271d0f',
    ],
  };

  return [ousd];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://ousd.com',
};
