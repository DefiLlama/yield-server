const sdk = require('@defillama/sdk');
const axios = require('axios');
const abi = require('./abi.js');
const PermissionlessNodeRegistryAbi = require('./ PermissionlessNodeRegistryAbi.json');

// const abiBsc = require('./abiBsc');
const abiPolygon = require('./abiPolygon');

const token = '0xa35b1b31ce002fbf2058d22f30f95d405200a15b';
const stakingContract = '0xcf5EA1b38380f6aF39068375516Daf40Ed70D299';
const nodeOperatorRegistry = '0x4f4bfa0861f62309934a5551e0b2541ee82fdcf1';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const getApy = async () => {
  let tvl = (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const nodeOperatorCount = (
    await sdk.api.abi.call({
      abi: PermissionlessNodeRegistryAbi.find(
        (m) => m.name === 'totalActiveValidatorCount'
      ),
      target: nodeOperatorRegistry,
    })
  ).output;

  // +4 ETH per node operator
  tvl += nodeOperatorCount * 4;

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
      abi: abi.find((m) => m.name === 'getExchangeRate'),
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: stakingContract,
      abi: abi.find((m) => m.name === 'getExchangeRate'),
      chain: 'ethereum',
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      target: stakingContract,
      abi: abi.find((m) => m.name === 'getExchangeRate'),
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

  // maticx contract on ethereum
  const stakeManagerContract = '0xf03A7Eb46d01d9EcAA104558C732Cf82f6B6B645';
  const exchangeRatesPolygon = await Promise.all([
    sdk.api.abi.call({
      target: stakeManagerContract,
      chain: 'ethereum',
      abi: abiPolygon.find((m) => m.name === 'convertMaticXToMatic'),
      params: [1000000000000000000n],
    }),
    sdk.api.abi.call({
      target: stakeManagerContract,
      chain: 'ethereum',
      abi: abiPolygon.find((m) => m.name === 'convertMaticXToMatic'),
      params: [1000000000000000000n],
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      target: stakeManagerContract,
      chain: 'ethereum',
      abi: abiPolygon.find((m) => m.name === 'convertMaticXToMatic'),
      params: [1000000000000000000n],
      block: block7dayAgo,
    }),
  ]);

  const apyBasePolygon =
    ((exchangeRatesPolygon[0].output[0] - exchangeRatesPolygon[1].output[0]) /
      1e18) *
    365 *
    100;

  const apyBase7dPolygon =
    ((exchangeRatesPolygon[0].output[0] - exchangeRatesPolygon[2].output[0]) /
      1e18 /
      7) *
    365 *
    100;

  const priceKeyPolygon = `ethereum:${stakeManagerContract}`;
  const maticxPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeyPolygon}`)
  ).data.coins[priceKeyPolygon]?.price;

  const tvlPolygon =
    (
      await sdk.api.abi.call({
        target: stakeManagerContract,
        abi: 'erc20:totalSupply',
        chain: 'ethereum',
      })
    ).output / 1e18;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'stader',
      symbol: 'ethx',
      tvlUsd: tvl * ethPrice,
      apyBase,
      apyBase7d,
      underlyingTokens: [weth],
    },
    {
      pool: stakeManagerContract,
      chain: 'polygon',
      project: 'stader',
      symbol: 'maticx',
      tvlUsd: tvlPolygon * maticxPrice,
      apyBase: apyBasePolygon,
      apyBase7d: apyBase7dPolygon,
      underlyingTokens: ['0x0000000000000000000000000000000000001010'],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://www.staderlabs.com/eth/stake/',
};
