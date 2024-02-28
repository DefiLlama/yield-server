const axios = require('axios');

function makeReadable(val, dec = 18) {
    return parseInt(val) / 10 ** dec;
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

async function getCoinPriceMap(tokenAddress) {
    const chain = 'arbitrum';

    const coinParams = tokenAddress.map((address) => {
        return `${chain}:${address}`;
    });

    const ids = coinParams.join(',');
    const response = await axios.get(
        `https://coins.llama.fi/prices/current/${ids}`
    );

    const coinMap = {};
    for (const id of Object.keys(response.data.coins)) {
        const coinAddress = id.split(':')[1];
        coinMap[coinAddress] = response.data.coins[id];
    }

    Object.keys(coinMap).forEach((key) => {
        const findIndex = tokenAddress
            .map((item) => item.toLowerCase())
            .indexOf(key);
        if (findIndex != -1) {
            coinMap[tokenAddress[findIndex]] = coinMap[key];
        }
    });

    return coinMap;
}

module.exports = {
    getCoinPriceMap,
    makeReadable,
    getDefiLLamaPools,
    getCurrentTimestamp,
};
