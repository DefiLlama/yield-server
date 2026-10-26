const sdk = require('@defillama/sdk');

const abi = require('./abi.json');
const { getPriceApiData } = require('../utils');
const { getRepriceApr } = require('./repriceApr');

const rswETH = '0xFAe103DC9cf190eD75350761e95403b7b8aFa6c0';

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: rswETH,
        abi: abi.find((m) => m.name === 'totalSupply'),
      })
    ).output / 1e18;

  const rate = (await sdk.api.abi.call({
    target: rswETH,
    abi: abi.find((m) => m.name === 'getRate'),
  })).output / 1e18;

  // the rswETH price already includes the rate
  const priceKey = `ethereum:${rswETH}`;
  const rswETHPrice = (await getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey].price;
  const tvlUsd = totalSupply * rswETHPrice;

  const [apr1d, apr7d] = await Promise.all([
    getRepriceApr(rswETH, 'newRswETHToETHRate', 1),
    getRepriceApr(rswETH, 'newRswETHToETHRate', 7),
  ]);

  return [
    {
      pool: rswETH,
      project: 'swell-liquid-restaking',
      chain: 'Ethereum',
      symbol: 'rswETH',
      tvlUsd: tvlUsd,
      apyBase: apr1d,
      apyBase7d: apr7d,
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
