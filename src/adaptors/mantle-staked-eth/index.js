const axios = require('axios');
const sdk = require('@defillama/sdk');

const stakingAbi = require('./stakingAbi.json');

const mETH = '0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa';
const stakingContract = '0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const amount = 1000000000000000000n;

const apy = async () => {
  const tvl =
    (
      await sdk.api.abi.call({
        target: stakingContract,
        abi: stakingAbi.find((m) => m.name === 'totalControlled'),
      })
    ).output / 1e18;

  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp1dayAgo}`)
  ).data.height;

  const block7dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp7dayAgo}`)
  ).data.height;

  const exchangeRates = await Promise.all([
    sdk.api.abi.call({
      target: stakingContract,
      abi: stakingAbi.find((m) => m.name === 'mETHToETH'),
      params: [amount],
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: stakingContract,
      abi: stakingAbi.find((m) => m.name === 'mETHToETH'),
      params: [amount],
      chain: 'ethereum',
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      target: stakingContract,
      abi: stakingAbi.find((m) => m.name === 'mETHToETH'),
      params: [amount],
      chain: 'ethereum',
      block: block7dayAgo,
    }),
  ]);

  const apyBase =
    ((exchangeRates[0].output - exchangeRates[1].output) / 1e18) * 365 * 100;

  const apyBase7d =
    ((exchangeRates[0].output - exchangeRates[2].output) / 1e18 / 7) *
    365 *
    100;

  const priceKey = `ethereum:${weth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: mETH,
      chain: 'ethereum',
      project: 'mantle-staked-eth',
      symbol: 'mETH',
      tvlUsd: tvl * ethPrice,
      apyBase,
      apyBase7d,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://meth.mantle.xyz/stake',
};
