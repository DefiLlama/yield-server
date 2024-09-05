const axios = require('axios');
const sdk = require('@defillama/sdk');

const abi = require('./abi.json');

const token = '0x8c1bed5b9a0928467c9b1341da1d7bd5e10b6549';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp1dayAgo}`)
  ).data.height;

  const block7dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp7dayAgo}`)
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
    sdk.api.abi.call({
      target: token,
      abi: abi.find((m) => m.name === 'sharesFromUnderlyingBalance'),
      params: [_underlyingAssetAmount],
      block: block7dayAgo,
    }),
  ]);

  const exchangeRateNow =
    _underlyingAssetAmount / sharesFromUnderlyingBalances[0].output;
  const exchangeRate1d =
    _underlyingAssetAmount / sharesFromUnderlyingBalances[1].output;
  const exchangeRate7d =
    _underlyingAssetAmount / sharesFromUnderlyingBalances[2].output;

  const apyBase1d = (exchangeRateNow - exchangeRate1d) * 365 * 100;
  const apyBase7d = ((exchangeRateNow - exchangeRate7d) / 7) * 365 * 100;

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
      apyBase: apyBase7d,
      apyBase7d,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://liquidcollective.io/',
};
