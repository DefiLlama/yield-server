const { default: axios } = require('axios');

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

async function getCoinPriceMap(
  tokenAddress,
  chainId,
) {
  if (tokenAddress.length === 0) return {};
  const chain = ChainIdToNetwork[chainId];

  const ids = coinParams.join(',');
  const response = await axios.get(
    `https://coins.llama.fi/prices/current/${ids}`,
  );

  // remap response.data.coins which have chain:tokenAddress as key to a map of tokenAddress -> CoinPrice
  const coinMap = {};
  for (const id of Object.keys(response.data.coins)) {
    const coinAddress = id.split(':')[1];
    coinMap[coinAddress] = response.data.coins[id];

    const customTokenAddress =
      reverseCustomTokenAddressRedirectMap[coinAddress.toLowerCase()];
    if (customTokenAddress) {
      coinMap[customTokenAddress] = response.data.coins[id];
    }
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
    makeReadable,
    getCoinPriceMap,
    getDefiLLamaPools,
    getCurrentTimestamp,
};

