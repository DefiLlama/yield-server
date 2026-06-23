const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const TD = '0x469bbd88eEA8A2D9a5C6c82d9890Cf60962C27e6';
const stTD = '0x0CB091e6D9fd696b4CC8571E19e042F456c182Ad';

const DAY = 24 * 3600;

const apy = async () => {
  const now = Math.floor(Date.now() / 1e3);
  const sevenDaysAgo = now - 7 * DAY;

  const [blockNow, block7d] = await Promise.all([
    axios.get(`https://coins.llama.fi/block/base/${now}`).then((r) => r.data.height),
    axios.get(`https://coins.llama.fi/block/base/${sevenDaysAgo}`).then((r) => r.data.height),
  ]);

  const [totalAssets, ppsNow, pps7d] = await Promise.all([
    sdk.api.abi.call({
      target: stTD,
      abi: 'uint256:totalAssets',
      chain: 'base',
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: stTD,
      abi: 'function convertToAssets(uint256) view returns (uint256)',
      params: ['1000000000000000000'],
      chain: 'base',
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: stTD,
      abi: 'function convertToAssets(uint256) view returns (uint256)',
      params: ['1000000000000000000'],
      chain: 'base',
      block: block7d,
    }),
  ]);

  const tvlRaw = Number(totalAssets.output) / 1e18;

  const prices = await utils.getPrices([TD], 'base');
  const tdPrice = prices.pricesByAddress?.[TD.toLowerCase()] ?? 1;

  const tvlUsd = tvlRaw * tdPrice;

  const priceNow = Number(ppsNow.output) / 1e18;
  const price7dAgo = Number(pps7d.output) / 1e18;
  const apyBase = price7dAgo > 0
    ? ((priceNow / price7dAgo) ** (365 / 7) - 1) * 100
    : 0;

  return [
    {
      pool: stTD,
      symbol: 'stTD',
      project: 'tizi',
      chain: utils.formatChain('base'),
      tvlUsd,
      apyBase,
      pricePerShare: priceNow,
      underlyingTokens: [TD],
      token: stTD,
      isIntrinsicSource: true,
      searchTokenOverride: 'stTD',
    },
  ];
};

module.exports = {
  apy,
  url: 'https://tizi.money/deposit',
  protocolId: '7787',
};
