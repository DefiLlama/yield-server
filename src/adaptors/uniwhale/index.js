const axios = require('axios');
const utils = require('../utils');

const USDT = '0x55d398326f99059fF775485246999027B3197955';
const UNIWHALE_LIQUIDITY_POOL = '0xBdeCAFd9096D43616a8E0eB8F3fa0865fD4769E7';

const getApy = async (...args) => {
  const tvl = await axios.post('https://bsc-dataseed1.binance.org/', {
    method: 'eth_call',
    params: [{ to: UNIWHALE_LIQUIDITY_POOL, data: '0xdd363371' }, 'latest'],
    id: 1,
    jsonrpc: '2.0',
  });
  const apr = await axios.post('https://gql.uniwhale.co/v1/graphql', {
    query: `query LatestTradeStats {
        latest_trade_stats_7d {
          apr_7d
        }
      }`,
    operationName: 'LatestTradeStats',
    variables: {},
  });
  return [
    {
      chain: utils.formatChain('bsc'),
      project: 'uniwhale',
      pool: UNIWHALE_LIQUIDITY_POOL,
      symbol: utils.formatSymbol('ULP'),
      tvlUsd: parseInt(tvl.data.result.substring(2), 16) / 1e18,
      apyBase: utils.aprToApy(
        apr.data.data.latest_trade_stats_7d[0].apr_7d * 0.7
      ),
      rewardTokens: [USDT],
      underlyingTokens: [USDT],
      url: 'https://app.uniwhale.co/liquidity',
    },
  ];
};

module.exports = {
  apy: getApy,
  url: 'https://app.uniwhale.co/earn',
};
