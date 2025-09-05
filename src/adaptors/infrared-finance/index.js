const sdk = require('@defillama/sdk');
const axios = require('axios');

const ibera = '0x9b6761bf2397bb5a6624a856cc84a3a14dcd3fe5';
const bera = '0x0000000000000000000000000000000000000000';
const project = 'infrared-finance';
const symbol = 'ibera';

const apy = async () => {
  const priceKey = `berachain:${bera}`;
  const beraPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;
  const timestampNow = Math.floor(Date.now() / 1000);
  const timestampYesterday = timestampNow - 86400;

  const blockNow = (
    await axios.get(
      `https://coins.llama.fi/block/berachain/${timestampNow}`
    )
  ).data.height;
  const blockYesterday = (
    await axios.get(`https://coins.llama.fi/block/berachain/${timestampYesterday}`)
  ).data.height;

      const exchangeRateAbi = {
        inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
        name: 'convertToAssets',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      };
      const exchangeRateYesterday = await sdk.api.abi.call({
        target: ibera,
        chain: 'berachain',
        abi: exchangeRateAbi,
        params: ['1000000000000000000'],
        block: blockYesterday,
      });

      const exchangeRateToday = await sdk.api.abi.call({
        target: ibera,
        chain: 'berachain',
        abi: exchangeRateAbi,
        params: ['1000000000000000000'],
        block: blockNow,
      });
        const totalPooledBera = await sdk.api.abi.call({
          target: ibera,
          chain: 'berachain',
          abi: 'uint256:totalAssets',
        });

      const apr =
        ((exchangeRateToday.output / 1e18 -
          exchangeRateYesterday.output / 1e18) /
          (exchangeRateYesterday.output / 1e18)) *
        365 *
        100;

  return [
    {
      pool: `${ibera}`,
      chain: 'berachain',
      project,
      symbol,
      underlyingTokens: [bera],
      apyBase: apr,
      tvlUsd: totalPooledBera.output/1e18 * beraPrice,
    },
  ];
};

module.exports = { apy, url: 'https://infrared.finance/ibera' };
