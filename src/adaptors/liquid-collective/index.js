const axios = require('axios');
const sdk = require('@defillama/sdk');

const abi = require('./abi.json');

const token = '0x8c1bed5b9a0928467c9b1341da1d7bd5e10b6549';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const apy = async () => {
  const timestamp1dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const duration = 1; // day
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp1dayAgo}`)
  ).data.height;

  const _underlyingAssetAmount = 10000;

  const sharesFromUnderlyingBalances = await Promise.all([
    sdk.api.abi.call({
      target: token,
      abi: abi.find((m) => m.name === 'sharesFromUnderlyingBalance'),
      params: [_underlyingAssetAmount],
    }),
    sdk.api.abi.call({
      target: token,
      abi: abi.find((m) => m.name === 'sharesFromUnderlyingBalance'),
      params: [_underlyingAssetAmount],
      block: block1dayAgo,
    }),
  ]);

  const exchangeRateNow =
    _underlyingAssetAmount / sharesFromUnderlyingBalances[0].output;
  const exchangeRateYst =
    _underlyingAssetAmount / sharesFromUnderlyingBalances[1].output;

  const apyBase = ((exchangeRateNow - exchangeRateYst) / duration) * 365 * 100;

  const priceKey = `ethereum:${weth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  const tvl =
    (
      await sdk.api.abi.call({
        target: token,
        abi: abi.find((m) => m.name === 'totalUnderlyingSupply'),
      })
    ).output / 1e18;

  return [
    {
      pool: token,
      symbol: 'lsETH',
      chain: 'Ethereum',
      project: 'liquid-collective',
      tvlUsd: tvl * ethPrice,
      apyBase,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://liquidcollective.io/',
};
