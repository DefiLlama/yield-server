const utils = require('../utils');

const API_URL = 'https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/tickers';

const getApy = async () => {
  const tickers = await utils.getData(API_URL);

  const pools = tickers.map((ticker) => ({
    pool: ticker.ticker_id,
    chain: utils.formatChain('ICP'),
    project: 'ICPSwap',
    symbol: ticker.ticker_name,
    tvlUsd: Number(ticker.liquidity_in_usd),
    apyBase:
      ((Number(ticker.volume_usd_24H) * 3) /
        1000 /
        Number(ticker.liquidity_in_usd)) *
      100 *
      360 *
      0.8,
    underlyingTokens: [ticker.target_id, ticker.base_id],
    poolMeta: 'V3 market',
  }));

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.icpswap.com',
};
