const utils = require('../utils');

const poolsFunction = async () => {
  const dataTvl = await utils.getData(
    'https://api.llama.fi/protocol/frigg.eco'
  );

  const friggPool = {
    pool: "0x90D53b872ce6421122B41a290aCdD22a5eD931bd",
    chain: "Ethereum",
    project: 'frigg.eco',
    symbol: 'ATT',
    tvlUsd: Number(dataTvl.currentChainTvls['Ethereum']),
    apyBase: 4,
    underlyingTokens: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
    poolMeta: "Frigg Token Pool",
  };

  return [friggPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://agatobwe.eco',
};