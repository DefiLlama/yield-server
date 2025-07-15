const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { default: axios } = require('axios');

const wrappers = [
  {
    address: '0x9fb76f7ce5fceaa2c42887ff441d46095e494206',
    symbol: 'wstkscUSD',
    underlyingToken: '0xd3DCe716f3eF535C5Ff8d041c1A41C3bd89b97aE',
  },
  {
    address: '0xDb58c4DB1a0f45DDA3d2F8e44C3300BB6510c866',
    symbol: 'wstkscBTC',
    underlyingToken: '0xBb30e76d9Bb2CC9631F7fC5Eb8e87B5Aff32bFbd',
  },
  {
    address: '0xe8a41c62bb4d5863c6eadc96792cfe90a1f37c47',
    symbol: 'wstkscETH',
    underlyingToken: '0x3bcE5CB273F0F148010BbEa2470e7b5df84C7812',
  },
];

const main = async () => {
  const prices = (
    await axios.get(
      `https://coins.llama.fi/prices/current/${wrappers
        .map((w) => `sonic:${w.underlyingToken}`)
        .join(',')}`
    )
  ).data.coins;
  const infos = await Promise.all(
    wrappers.map((w) => utils.getERC4626Info(w.address, 'sonic'))
  );
  return infos.map((info, i) => {
    const token = `sonic:${wrappers[i].underlyingToken}`;
    return {
      pool: info.pool,
      chain: 'sonic',
      project: 'trevee-earn',
      symbol: wrappers[i].symbol,
      tvlUsd: (info.tvl / 10 ** prices[token].decimals) * prices[token].price,
      apyBase: info.apyBase,
      underlyingTokens: [wrappers[i].underlyingToken],
    };
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.rings.money/earn/mint/',
};
