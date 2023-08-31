const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const abiMarket = require('./abiMarket.json');
const abiReader = require('./abiReader.json');

const chains = {
  arbitrum: {
    Reader: '0x38d91ED96283d62182Fc6d990C24097A918a4d9b',
    DataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
  },
  avax: {
    Reader: '0x1D5d64d691FBcD8C80A2FD6A9382dF0fe544cBd8',
    DataStore: '0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6',
  },
};

const apy = async (chain) => {
  const { Reader, DataStore } = { ...chains[chain] };

  const endBlock = (
    await axios.get(
      `https://coins.llama.fi/block/${chain}/${Math.floor(Date.now() / 1000)}`
    )
  ).data.height;

  const markets = (
    await sdk.api.abi.call({
      target: Reader,
      abi: abiReader.find((m) => m.name === 'getMarkets'),
      params: [DataStore, 0, endBlock],
      chain,
    })
  ).output;

  const longTokenBalances = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({
        target: m.longToken,
        params: [m.marketToken],
      })),
      abi: 'erc20:balanceOf',
      chain,
    })
  ).output.map((o) => o.output);

  const shortTokenBalances = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({
        target: m.shortToken,
        params: [m.marketToken],
      })),
      abi: 'erc20:balanceOf',
      chain,
    })
  ).output.map((o) => o.output);

  const longTokenDecimals = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({
        target: m.longToken,
      })),
      abi: 'erc20:decimals',
      chain,
    })
  ).output.map((o) => o.output);

  const shortTokenDecimals = (
    await sdk.api.abi.multiCall({
      calls: markets.map((m) => ({
        target: m.shortToken,
      })),
      abi: 'erc20:decimals',
      chain,
    })
  ).output.map((o) => o.output);

  const tokens = [
    ...new Set(markets.map((m) => [m.longToken, m.shortToken]).flat()),
  ];
  const priceKeys = tokens.map((t) => `${chain}:${t}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  return markets.map((m, i) => {
    const t1 = prices[`${chain}:${m.longToken}`];
    const t2 = prices[`${chain}:${m.shortToken}`];

    const t1Balance =
      (longTokenBalances[i] / 10 ** longTokenDecimals[i]) * t1.price;
    const t2Balance =
      (shortTokenBalances[i] / 10 ** shortTokenDecimals[i]) * t2.price;

    const tvlUsd = t1Balance + t2Balance;

    const longTokenSymbol = t1.symbol;
    const shortTokenSymbol = t2.symbol;

    return {
      pool: m.marketToken,
      project: 'gmx-v2',
      chain,
      symbol: `${longTokenSymbol}-${shortTokenSymbol}`,
      poolMeta: 'GM',
      tvlUsd,
      apy: 0,
      underlyingTokens: [m.longToken, m.shortToken],
    };
  });
};

const main = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map((chain) => apy(chain))
  );

  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.gmx.io/#/earn',
};
