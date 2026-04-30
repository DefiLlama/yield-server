const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const SUSDAT_ADDRESS = '0xD166337499E176bbC38a1FBd113Ab144e5bd2Df7';
const USDAT_ADDRESS = '0x23238f20b894f29041f48D88eE91131C395Aaa71';

const abi = {
  totalAssets: {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  previewRedeem: {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'previewRedeem',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
};

const ONE_E18 = '1000000000000000000';

const main = async () => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp1dAgo = now - 86400;
  const timestamp7dAgo = now - 86400 * 7;

  const totalAssets = await sdk.api.abi.call({
    target: SUSDAT_ADDRESS,
    chain: 'ethereum',
    abi: abi.totalAssets,
  });
  const block1dAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp1dAgo}`)
  ).data.height;
  const block7dAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp7dAgo}`)
  ).data.height;

  const [rateNow, rate1dAgo, rate7dAgo] = await Promise.all([
    sdk.api.abi.call({
      target: SUSDAT_ADDRESS,
      abi: abi.previewRedeem,
      params: [ONE_E18],
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: SUSDAT_ADDRESS,
      abi: abi.previewRedeem,
      params: [ONE_E18],
      chain: 'ethereum',
      block: block1dAgo,
    }),
    sdk.api.abi.call({
      target: SUSDAT_ADDRESS,
      abi: abi.previewRedeem,
      params: [ONE_E18],
      chain: 'ethereum',
      block: block7dAgo,
    }),
  ]);

  const apyBase =
    rate1dAgo.output > 0
      ? ((rateNow.output / rate1dAgo.output) ** 365 - 1) * 100
      : 0;
  const apyBase7d =
    rate7dAgo.output > 0
      ? ((rateNow.output / rate7dAgo.output) ** (365 / 7) - 1) * 100
      : 0;

  const priceKey = `ethereum:${USDAT_ADDRESS}`;
  const usdatPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  const tvlUsd = (totalAssets.output / 1e6) * usdatPrice;

  return [
    {
      pool: SUSDAT_ADDRESS,
      chain: utils.formatChain('ethereum'),
      project: 'saturn',
      symbol: 'sUSDat',
      tvlUsd,
      apyBase,
      apyBase7d,
      // USDat is 6-dec; sUSDat shares are 18-dec.
      ...(Number(rateNow.output) / 1e6 > 0 && { pricePerShare: Number(rateNow.output) / 1e6 }),
      underlyingTokens: [USDAT_ADDRESS],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.saturn.credit/',
};
