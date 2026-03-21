const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { default: axios } = require('axios');

const PROJECT = 'guru-network-classic'
const wrappers = [
  {
    address: '0x5b8ce6d591c914a56cb019b3decb63ede22708c8',
    symbol: 'stakeTHENA',
    underlyingToken: '0xafbe3b8b0939a5538de32f7752a78e08c8492295',
    underlyingChain: 'bsc',
    poolUrl: 'https://eliteness.network/ethena'
  },
];

const main = async () => {
  const prices = (
    await axios.get(
      `https://coins.llama.fi/prices/current/${wrappers.map((w) => `${w.underlyingChain}:${w.underlyingToken}`).join(',')}`
    )
  ).data.coins;
  const infos = await Promise.all(
    wrappers.map((w) => utils.getERC4626Info(w.address, w.underlyingChain))
  );
  return infos.map((info, i) => {
    const token = `${wrappers[i].underlyingChain}:${wrappers[i].underlyingToken}`;
    return {
      pool: info.pool,
      chain: wrappers[i].underlyingChain,
      project: PROJECT,
      symbol: wrappers[i].symbol,
      tvlUsd: (info.tvl / 10 ** prices[token].decimals) * prices[token].price,
      apyBase: info.apyBase,
      underlyingTokens: [wrappers[i].underlyingToken],
      url: wrappers[i].poolUrl
    };
  });
};

module.exports = {
  timetravel: true,
  apy: main,
  // url: 'https://example.com/pools', // Link to page with pools (Only required if you do not provide url's for each pool),
};
