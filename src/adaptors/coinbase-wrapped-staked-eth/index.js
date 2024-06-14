const ADDRESSES = require('../assets.json')
const sdk = require('@defillama/sdk');
const axios = require('axios');
const abi = require('./abi.js');

const token = ADDRESSES.ethereum.cbETH;
const weth = ADDRESSES.ethereum.WETH;

const getApy = async () => {
  const tvl = (
    await axios.get('https://api.exchange.coinbase.com/wrapped-assets/CBETH')
  ).data.circulating_supply;

  const timestamp1dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const duration = 1; // day
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp1dayAgo}`)
  ).data.height;

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
    ((exchangeRates[0].output - exchangeRates[1].output) / 1e18 / duration) *
    365 *
    100;

  const priceKey = `ethereum:${weth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'coinbase-wrapped-staked-eth',
      symbol: 'cbeth',
      tvlUsd: tvl * ethPrice,
      apyBase: apr,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://coinbase.com',
};
