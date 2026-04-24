const axios = require('axios');
const utils = require('../utils');

const API_URL =
  'https://boost-gateway.btcfi.one/v1/products/5534c4c2-9cb4-4514-99f5-4c79a7030b27';
const PROJECT_NAME = 'btcfi-cdp';

const apy = async () => {
  const response = await axios.get(API_URL);
  const data = response.data;

  const cbBTCPool = {
    pool: `0x4F7aB59b5AC112970F5dD66D8a7ac505c8E5e08B-base`.toLowerCase(),
    chain: utils.formatChain('base'),
    project: PROJECT_NAME,
    symbol: 'cbBTC', // cbBTC
    tvlUsd: Number(data.tvl),
    apyBase: Number(data.estimatedApyRate),
    underlyingTokens: ['0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf'], // cbBTC address
    url: 'https://btcfi.one/',
  };

  return [cbBTCPool];
};

module.exports = {
  apy: apy,
  url: 'https://btcfi.one/',
};
