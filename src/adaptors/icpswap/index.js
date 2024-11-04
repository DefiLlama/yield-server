const utils = require('../utils');

const API_URL = 'https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/tickers';

const TOKEN_LIST_URL =
  'https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/token-list';

const getApy = async () => {
  const tickers = await utils.getData(API_URL);
  const allTokens = await utils.getData(TOKEN_LIST_URL);

  const pools = tickers
    .filter((ticker) => {
      return (
        allTokens.includes(ticker.base_id) &&
        allTokens.includes(ticker.target_id)
      );
    })
    .map((ticker) => ({
      pool: ticker.ticker_id,
      chain: utils.formatChain('ICP'),
      // Should be the same as adaptor slug
      project: 'icpswap',
      symbol: ticker.ticker_name,
      tvlUsd: Number(ticker.liquidity_in_usd),
      apyBase:
        // if liquidity_in_usd is zero, the apy result is not finite
        Number(ticker.liquidity_in_usd) === 0
          ? 0
          : ((Number(ticker.volume_usd_24H) * 3) /
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
