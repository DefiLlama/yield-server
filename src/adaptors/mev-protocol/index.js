const axios = require('axios');
const sdk = require('@defillama/sdk');

const abi = require('./abi.json');
const mevETH = '0x24Ae2dA0f361AA4BE46b48EB19C91e02c5e4f27E';

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: mevETH,
        abi: abi.find((m) => m.name === 'totalSupply'),
      })
    ).output / 1e18;

  const fraction = (
    await sdk.api.abi.call({
      target: mevETH,
      abi: abi.find((m) => m.name === 'fraction'),
    })
  ).output;

  const mevEthPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/ethereum:${mevETH}`)
  ).data.coins[`ethereum:${mevETH}`].price;

  const elastic = fraction[0];
  const base = fraction[1];
  const rate = elastic / base;
  const tvlUsd = totalSupply * rate * mevEthPrice;
  const startTime = new Date(1696426103 * 1000);
  const endTime = new Date();
  const yearInSeconds = 31536000;
  const timeSinceLaunch = (endTime.getTime() - startTime.getTime()) / 1000;
  const apyBase =
    (100 *
      (parseFloat(elastic.toString()) - parseFloat(base.toString())) *
      yearInSeconds) /
    (timeSinceLaunch * parseFloat(base.toString()));

  return [
    {
      pool: mevETH,
      project: 'mev-protocol',
      chain: 'Ethereum',
      symbol: 'mevETH',
      tvlUsd,
      apyBase,
      apyBase7d: apyBase,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://mev.io/stake',
};
