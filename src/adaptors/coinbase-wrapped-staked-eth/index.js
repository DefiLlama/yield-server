const sdk = require('@defillama/sdk');
const axios = require('axios');
const abi = require('./abi.js');
const { getPriceApiData } = require('../utils');

const token = '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704';

const getApy = async () => {
  const tvl = (
    await axios.get('https://api.exchange.coinbase.com/wrapped-assets/CBETH')
  ).data.circulating_supply;

  const timestamp1dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const duration = 1; // day
  const block1dayAgo = (await getPriceApiData(`/block/ethereum/${timestamp1dayAgo}`)).height;

  const exchangeRates = await Promise.all([
    sdk.api.abi.call({
      target: token,
      abi: abi.find((m) => m.name === 'exchangeRate'),
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: token,
      abi: abi.find((m) => m.name === 'exchangeRate'),
      chain: 'ethereum',
      block: block1dayAgo,
    }),
  ]);

  const apr =
    ((exchangeRates[0].output - exchangeRates[1].output) / exchangeRates[1].output / duration) *
    365 *
    100;

  const priceKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const ethPrice = (await getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;
  const exchangeRate = Number(exchangeRates[0].output) / 1e18;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'coinbase-wrapped-staked-eth',
      symbol: 'cbeth',
      tvlUsd: tvl * exchangeRate * ethPrice,
      apyBase: apr,
      ...(exchangeRate > 0 && { pricePerShare: exchangeRate }),
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      searchTokenOverride: token,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '3594',
  timetravel: false,
  apy: getApy,
  url: 'https://coinbase.com',
};
