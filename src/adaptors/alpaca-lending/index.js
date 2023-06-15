const axios = require('axios');
const utils = require('../utils');

async function apy(chain) {
  const response = (
    await axios.get(
      `https://alpaca-static-api.alpacafinance.org/${chain}/v1/landing/summary.json`
    )
  ).data.data;

  const chainString = utils.formatChain(chainMapping[chain]);

  return response.lendingPools.map((p) => ({
    pool: `${p.ibToken.address}-${chainString}`.toLowerCase(),
    chain: chainString,
    project: 'alpaca-lending',
    symbol: utils.formatSymbol(p.symbol),
    tvlUsd: Number(p.tvl),
    apy: Number(p.totalApy),
    underlyingTokens: [p.baseToken.address],
  }));
}

const chainMapping = {
  bsc: 'binance',
  ftm: 'fantom',
};

const main = async () => {
  const [bsc, ftm] = await Promise.all([apy('bsc'), apy('ftm')]);
  return [...bsc, ...ftm];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.alpacafinance.org/farm',
};
