const utils = require('../utils');
const sdk = require('@defillama/sdk');
const sTlosAbi = require('./sTlos.json');
const axios = require('axios');

const sTLOS = '0xb4b01216a5bc8f1c8a33cd990a1239030e60c905';

async function poolsFunction(timestamp, block, chainBlocks) {
  const pooledTLOS =
    (
      await sdk.api.abi.call({
        target: sTLOS,
        abi: sTlosAbi.totalAssets,
        chain: 'telos',
      })
    ).output / 1e18;

  const priceKey = 'coingecko:telos';
  const telosPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const apyPercentage = (await axios.get('https://api.telos.net/v1/apy/evm'))
    .data;

  return [
    {
      pool: sTLOS,
      chain: utils.formatChain('telos'),
      project: 'stlos-liquid-staking',
      symbol: utils.formatSymbol('sTLOS'),
      tvlUsd: pooledTLOS * telosPrice,
      apyBase: apyPercentage,
    },
  ];
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://www.teloscan.io/staking',
};
