const utils = require('../utils');

const API_URL = 'https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/tickers';

const TOKEN_LIST_URL =
  'https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/token-list';

const ICP_COINGECKO = {
  'ryjl3-tyaaa-aaaaa-aaaba-cai': 'coingecko:internet-computer',
  'mxzaz-hqaaa-aaaar-qaada-cai': 'coingecko:chain-key-bitcoin',
  'ss2fx-dyaaa-aaaar-qacoq-cai': 'coingecko:chain-key-ethereum',
  'xevnm-gaaaa-aaaar-qafnq-cai': 'coingecko:usd-coin',
  'cngnf-vqaaa-aaaar-qag4q-cai': 'coingecko:tether',
  'ly36x-wiaaa-aaaai-aqj7q-cai': 'coingecko:vnx-swiss-franc',
  '6c7su-kiaaa-aaaar-qaira-cai': 'coingecko:gold-token',
  'buwm7-7yaaa-aaaar-qagva-cai': 'coingecko:neuron-icp',
  '4c4fd-caaaa-aaaaq-aaa3a-cai': 'coingecko:ic-ghost',
  '2ouva-viaaa-aaaaq-aaamq-cai': 'coingecko:openchat'
};

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
      underlyingTokens: [ICP_COINGECKO[ticker.target_id] || ticker.target_id, ICP_COINGECKO[ticker.base_id] || ticker.base_id],
      poolMeta: 'V3 market',
    }));

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.icpswap.com',
};
