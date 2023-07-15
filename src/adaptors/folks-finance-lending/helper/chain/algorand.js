// documentation: https://developer.algorand.org/docs/get-details/indexer/?from_query=curl#sdk-client-instantiations

const axios = require('axios');
const { RateLimiter } = require('limiter');

const axiosObj = axios.create({
  baseURL: 'https://mainnet-idx.algonode.cloud',
  timeout: 300000,
});

const indexerLimiter = new RateLimiter({
  tokensPerInterval: 10,
  interval: 'second',
});

async function lookupApplications(appId) {
  return (await axiosObj.get(`/v2/applications/${appId}`)).data;
}

const withLimiter =
  (fn, tokensToRemove = 1) =>
  async (...args) => {
    await indexerLimiter.removeTokens(tokensToRemove);
    return fn(...args);
  };

module.exports = {
  lookupApplications: withLimiter(lookupApplications),
};
