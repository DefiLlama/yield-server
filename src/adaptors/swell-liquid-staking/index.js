const axios = require('axios');
const sdk = require('@defillama/sdk3');

const abi = require('./abi.json');

const apr = 'https://v3.svc.swellnetwork.io/swell.v3.StatsService/All';
const apr7d = 'https://v3.svc.swellnetwork.io/api/tokens/sweth/apr';
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

  const priceKey = `ethereum:${swETH}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const tvlUsd = totalSupply * rate * ethPrice;

  const apyBase = (await axios.post(apr, {})).data.stakingAprPercent;
  const apyBase7d = (await axios.get(apr7d)).data;

  return [
    {
      pool: swETH,
      project: 'swell-liquid-staking',
      chain: 'Ethereum',
      symbol: 'swETH',
      tvlUsd,
      apyBase: apyBase7d,
      apyBase7d,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.swellnetwork.io/',
};
