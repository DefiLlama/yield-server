const axios = require('axios');
const sdk = require('@defillama/sdk');

const abi = require('./abi.json');

const apr = 'https://v3-lrt.svc.swellnetwork.io/api/tokens/rrswETH/apr';
const apr7d = 'https://v3-lrt.svc.swellnetwork.io/api/tokens/rrswETH/apr';
const rswETH = '0xFAe103DC9cf190eD75350761e95403b7b8aFa6c0';

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: rswETH,
        abi: abi.find((m) => m.name === 'totalSupply'),
      })
    ).output / 1e18;

  const rate =
    (
      await sdk.api.abi.call({
        target: rswETH,
        abi: abi.find((m) => m.name === 'getRate'),
      })
    ).output / 1e18;

  const priceKey = `ethereum:${rswETH}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const tvlUsd = totalSupply * rate * ethPrice;

  // const apyBase = (await axios.post(apr, {})).data.stakingAprPercent;
  const apyBase7d = (await axios.get(apr7d)).data;

  return [
    {
      pool: rswETH,
      project: 'swell-liquid-staking',
      chain: 'Ethereum',
      symbol: 'rswETH',
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
  url: 'https://app.swellnetwork.io/stake/rsweth',
};
