const { getRepriceApy, getTvl } = require('../swell-liquid-restaking/reprice');

const swETH = '0xf951E335afb289353dc249e82926178EaC7DEd78';

const apy = async () => {
  const [apyFields, { tvlUsd, rate }] = await Promise.all([
    getRepriceApy(swETH, 'newSwETHToETHRate'),
    getTvl(swETH),
  ]);

  return [
    {
      pool: swETH,
      project: 'swell-liquid-staking',
      chain: 'Ethereum',
      symbol: 'swETH',
      tvlUsd,
      ...apyFields,
      ...(rate > 0 && { pricePerShare: rate }),
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '2901',
  timetravel: false,
  apy,
  url: 'https://app.swellnetwork.io/',
};
