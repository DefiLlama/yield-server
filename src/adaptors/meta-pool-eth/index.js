const axios = require('axios');
const sdk = require('@defillama/sdk4');

const abi = require('./abi.json');

const token = '0x48AFbBd342F64EF8a9Ab1C143719b63C2AD81710';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const apy = async () => {
  const timestamp1dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const duration = 1; // day
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp1dayAgo}`)
  ).data.height;

  const exchangeRates = await Promise.all([
    sdk.api.abi.call({
      target: token,
      abi: abi.find((m) => m.name === 'convertToAssets'),
      params: [1000000000000000000n],
    }),
    sdk.api.abi.call({
      target: token,
      abi: abi.find((m) => m.name === 'convertToAssets'),
      params: [1000000000000000000n],
      block: block1dayAgo,
    }),
  ]);

  const apr =
    ((exchangeRates[0].output - exchangeRates[1].output) / 1e18 / duration) *
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
      apyBase: apr,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.metapool.app/stake?token=ethereum',
};
