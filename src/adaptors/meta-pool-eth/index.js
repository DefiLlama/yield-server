const axios = require('axios');
const sdk = require('@defillama/sdk');

const abi = require('./abi.json');

const token = '0x48AFbBd342F64EF8a9Ab1C143719b63C2AD81710';
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

  const amount = 1000000000000000000n;

  const exchangeRates = await Promise.all([
    sdk.api.abi.call({
      target: token,
      abi: abi.find((m) => m.name === 'convertToAssets'),
      params: [amount],
    }),
    sdk.api.abi.call({
      target: token,
      abi: abi.find((m) => m.name === 'convertToAssets'),
      params: [amount],
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      target: token,
      abi: abi.find((m) => m.name === 'convertToAssets'),
      params: [amount],
      block: block7dayAgo,
    }),
  ]);

  const apyBase =
    ((exchangeRates[0].output - exchangeRates[1].output) / 1e18) * 365 * 100;

  const apyBase7d =
    ((exchangeRates[0].output - exchangeRates[2].output) / 1e18 / 7) *
    365 *
    100;

  const totalSupply =
    (
      await sdk.api.abi.call({
        target: token,
        abi: abi.find((m) => m.name === 'totalSupply'),
      })
    ).output / 1e18;

  const k = 'coingecko:ethereum';
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${k}`)
  ).data.coins[k].price;

  return [
    {
      pool: token,
      project: 'meta-pool-eth',
      chain: 'ethereum',
      symbol: 'mpETH',
      tvlUsd: totalSupply * ethPrice,
      apyBase,
      apyBase7d,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.metapool.app/stake?token=ethereum',
};
