const axios = require('axios');
const utils = require('../utils');

async function apy() {
  const credixMarketStatsResponse = await axios.get(
    'https://credix-market-stats.credix.workers.dev/?cached=True'
  );
  const credixApyResponse = await axios.get(
    'https://credix-trailing-apy.credix.workers.dev/'
  );
  const credixMarketStats = credixMarketStatsResponse.data;
  const credixApy =
    credixApyResponse.data['credix-marketplace']['apy_90_d_trailing'];
  const tvl = credixMarketStats.TVL;
  const poolObj = {
    pool: '66v9TQq1P7JKMiKjUZ4xxZRoZh7zyqVdEwuaEAHuE1Bx-solana',
    chain: utils.formatChain('solana'),
    project: 'credix',
    symbol: 'USDC',
    tvlUsd: tvl,
    apyBase: credixApy * 100,
    underlyingTokens: ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
    // borrow fields
    ltv: 0, // permissioned
  };
  const pool = [poolObj];

  return pool;
}

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.credix.finance',
};
