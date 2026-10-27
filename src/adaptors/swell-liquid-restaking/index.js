const { getRepriceApy, getTvl } = require('./reprice');

const rswETH = '0xFAe103DC9cf190eD75350761e95403b7b8aFa6c0';

const apy = async () => {
  const [apyFields, { tvlUsd, rate }] = await Promise.all([
    getRepriceApy(rswETH, 'newRswETHToETHRate'),
    getTvl(rswETH),
  ]);

  return [
    {
      pool: rswETH,
      project: 'swell-liquid-restaking',
      chain: 'Ethereum',
      symbol: 'rswETH',
      tvlUsd,
      ...apyFields,
      ...(rate > 0 && { pricePerShare: rate }),
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '4078',
  apy,
  timetravel: false,
  url: 'https://app.swellnetwork.io/stake/rsweth',
};
