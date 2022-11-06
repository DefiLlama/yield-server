const retry = require('async-retry');
const axios = require('axios');
const MAX_PROMISE_RETRY = 3;

async function fetchURL(url) {
  return await retry(async (bail) => await axios.get(url), {
    retries: 3,
  });
}

async function tryUntilSucceed(promiseFn, maxTries = MAX_PROMISE_RETRY) {
  try {
    return await promiseFn();
  } catch (e) {
    if (maxTries > 0) {
      return tryUntilSucceed(promiseFn, maxTries - 1);
    }
    throw e;
  }
}

module.exports = {
  fetchURL,
  tryUntilSucceed,
};
