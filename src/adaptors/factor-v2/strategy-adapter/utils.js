const { default: axios } = require('axios');

async function getAprFromDefillamaPool(apyFunction, poolId) {
    const pools = await apyFunction();
    const pool = pools.filter(
        (item) => item.pool.toLowerCase() == poolId.toLowerCase()
    );

    if (!pool.length) return 0;

    const apr = pool[0].apyBase + pool[0].apyReward;

    return apr;
}

function makeReadable(val, dec = 18) {
    return parseInt(val) / 10 ** dec;
}

async function getCoinDataFromDefillamaAPI(chain, tokenAddress) {
    const coinId = `${chain}:${tokenAddress}`;
    const response = await axios.get(
        'https://coins.llama.fi/prices/current/' + coinId
    );
    const coinData = response.data.coins[coinId];

    // { decimals, symbol, price, timestamp, confidence }
    return coinData;
}

function getCurrentTimestamp() {
    const timestamp = Math.floor(Date.now() / 1000);
    return timestamp;
}

async function getDefiLLamaPools(poolId) {
    const response = await axios.get('https://yields.llama.fi/pools');
    const pools = response.data.data;
    return pools.find(
        (pools) => pools.pool.toLowerCase() == poolId.toLowerCase()
    );
}

module.exports = {
    makeReadable,
    getAprFromDefillamaPool,
    getCoinDataFromDefillamaAPI,
    getDefiLLamaPools,
    getCurrentTimestamp,
};
