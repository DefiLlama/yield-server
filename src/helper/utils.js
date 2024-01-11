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

function sliceIntoChunks(arr, chunkSize = 100) {
  const res = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    res.push(chunk);
  }
  return res;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  fetchURL,
  tryUntilSucceed,
};
