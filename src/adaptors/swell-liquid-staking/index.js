const sdk = require('@defillama/sdk');

const abi = require('./abi.json');
const { getPriceApiData } = require('../utils');
const { getRepriceApr } = require('../swell-liquid-restaking/repriceApr');

const swETH = '0xf951E335afb289353dc249e82926178EaC7DEd78';

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: swETH,
        abi: abi.find((m) => m.name === 'totalSupply'),
      })
    ).output / 1e18;

  const rate =
    (
      await sdk.api.abi.call({
        target: swETH,
        abi: abi.find((m) => m.name === 'getRate'),
      })
    ).output / 1e18;

  // the swETH price already includes the rate
  const priceKey = `ethereum:${swETH}`;
  const swETHPrice = (await getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey].price;

  const tvlUsd = totalSupply * swETHPrice;

  // Swell's own apr endpoint annualizes the unbacked 2026-10-21 rate increases, so the APR is computed on-chain
  // from the reprices that reported rewards
  const apyBase7d = await getRepriceApr(swETH, 'newSwETHToETHRate', 7);

  return [
    {
      pool: swETH,
      project: 'swell-liquid-staking',
      chain: 'Ethereum',
      symbol: 'swETH',
      tvlUsd,
      apyBase: apyBase7d,
      apyBase7d,
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
