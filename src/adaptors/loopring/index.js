const utils = require('../utils');
const axios = require('axios');

const API_URL = 'https://api.loopring.network/api/v2/amm/poolsStats';
const TOKENS_URL = 'https://api.loopring.network/api/v2/exchange/tokens';

const getApy = async () => {
  const [poolsData, tokensData] = await Promise.all([
    axios.get(API_URL),
    axios.get(TOKENS_URL),
  ]);

  // Build symbol -> address mapping
  const tokensBySymbol = {};
  for (const token of tokensData.data.data) {
    tokensBySymbol[token.symbol] = token.address;
  }

  const pools = poolsData.data.data.map((pool) => {
    // Market format is "AMM-TOKEN0-TOKEN1"
    const symbols = pool.market.replace('AMM-', '').split('-');
    const underlyingTokens = symbols
      .map((s) => tokensBySymbol[s])
      .filter((addr) => addr);

    return {
      pool: `${pool.market}-loopring`,
      chain: utils.formatChain('ethereum'),
      project: 'loopring',
      symbol: pool.market.replace('AMM-', ''),
      tvlUsd: Number(pool.liquidityUSD),
      apy: Number(pool.apyBips) / 100,
      ...(underlyingTokens.length > 0 && { underlyingTokens }),
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://loopring.io/#/markets',
};
