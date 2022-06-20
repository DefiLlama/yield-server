const retry = require('async-retry');
const axios = require("axios");

async function fetchURL(url) {
    return await retry(async bail => await axios.get(url), {
        retries: 3
    })
};

module.exports = {
    fetchURL
};