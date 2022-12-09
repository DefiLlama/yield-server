const sdk = require('@defillama/sdk');
const axios = require('axios');

const idleTokenAbi = require('./idleTokenAbi.js');
const unitrollerAbi = require('./unitrollerAbi.js');
const utils = require('../utils');
const { symbol } = require('@defillama/sdk/build/erc20/index.js');

const unitroller = '0x275DA8e61ea8E02d51EDd8d0DC5c0E62b4CDB0BE';
const IDLE = '0x875773784af8135ea0ef43b5a374aad105c5d39e';

const apy = async () => {
  const markets = (
    await sdk.api.abi.call({
      target: unitroller,
      abi: unitrollerAbi.find((m) => m.name === 'getAllMarkets'),
      chain: 'ethereum',
    })
  ).output;

  const underlyingTokens = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: idleTokenAbi.find((m) => m.name === 'token'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const underlyingPrices = (
    await axios.get(
      `https://coins.llama.fi/prices/current/${underlyingTokens
        .map((t) => `ethereum:${t}`)
        .join(',')}`
    )
  ).data.coins;

  const avgAPRs = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: idleTokenAbi.find((m) => m.name === 'getAvgAPR'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const names = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: idleTokenAbi.find((m) => m.name === 'name'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const totalSupplys = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: idleTokenAbi.find((m) => m.name === 'totalSupply'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const idleTokenPrices = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: m })),
      abi: idleTokenAbi.find((m) => m.name === 'tokenPrice'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const blockTime = 12;
  const blocksPerYear = (60 * 60 * 24 * 365) / blockTime;

  const idleSpeeds = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({ target: unitroller, params: [m] })),
      abi: unitrollerAbi.find((m) => m.name === 'idleSpeeds'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const idlePrice = (
    await axios.get(`https://coins.llama.fi/prices/current/ethereum:${IDLE}`)
  ).data.coins;

  return markets
    .map((p, i) => {
      // risk adjusted pools are no longer supported
      if (names[i].toLowerCase().includes('risk adjusted')) return null;
      const tvlUsd =
        (((totalSupplys[i] / 1e18) * idleTokenPrices[i]) /
          10 ** underlyingPrices[`ethereum:${underlyingTokens[i]}`]?.decimals) *
        underlyingPrices[`ethereum:${underlyingTokens[i]}`]?.price;

      const idlePerDay = ((idleSpeeds[i] / 1e18) * 86400) / 13.5;
      const apyReward =
        ((idlePerDay * 365 * idlePrice[`ethereum:${IDLE}`].price) / tvlUsd) *
        100;

      return {
        pool: p,
        apyBase: utils.aprToApy(avgAPRs[i] / 1e18, blocksPerYear),
        apyReward,
        rewardTokens: apyReward > 0 ? [IDLE] : [],
        symbol: underlyingPrices[`ethereum:${underlyingTokens[i]}`].symbol,
        tvlUsd,
        chain: 'ethereum',
        project: 'idle-finance',
        underlyingTokens: [underlyingTokens[i]],
        poolMeta: names[i].includes('Best') ? 'Best Yield' : 'Risk adjusted',
      };
    })
    .filter((p) => p !== null);
};

module.exports = {
  apy,
  timetravel: false,
  url: 'test',
};
