const sdk = require('@defillama/sdk');
const axios = require('axios');

const skntq = '0x696238e0Ca31c94e24ca4CBe7921754E172E4d0F';
const kntq = '0x000000000000780555bD0BCA3791f89f9542c2d6';
const project = 'kinetiq-khype';
const symbol = 'skntq';
const chain = 'hyperliquid';

const apy = async () => {
  const priceKey = `${chain}:${kntq}`;
  const kntqPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;
  const timestampNow = Math.floor(Date.now() / 1000);
  const timestampYesterday = timestampNow - 86400;

  const blockNow = (
    await axios.get(`https://coins.llama.fi/block/${chain}/${timestampNow}`)
  ).data.height;
  const blockYesterday = (
    await axios.get(
      `https://coins.llama.fi/block/${chain}/${timestampYesterday}`
    )
  ).data.height;

  const exchangeRateAbi = {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };
  const exchangeRateYesterday = await sdk.api.abi.call({
    target: skntq,
    chain,
    abi: exchangeRateAbi,
    params: ['1000000000000000000'],
    block: blockYesterday,
  });

  const exchangeRateToday = await sdk.api.abi.call({
    target: skntq,
    chain,
    abi: exchangeRateAbi,
    params: ['1000000000000000000'],
    block: blockNow,
  });
  const totalPooledKntq = await sdk.api.abi.call({
    target: skntq,
    chain,
    abi: 'uint256:totalAssets',
  });

  const apr =
    ((exchangeRateToday.output / 1e18 - exchangeRateYesterday.output / 1e18) /
      (exchangeRateYesterday.output / 1e18)) *
    365 *
    100;

  return [
    {
      pool: skntq,
      chain,
      project,
      symbol,
      underlyingTokens: [kntq],
      apyBase: apr,
      tvlUsd: (totalPooledKntq.output / 1e18) * kntqPrice,
    },
  ];
};

module.exports = { apy, url: 'https://kinetiq.xyz/kntq' };
