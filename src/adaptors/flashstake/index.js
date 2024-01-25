const utils = require('../utils');

const API_LATEST = "https://apr.flashstake.io/latest";
const API_HISTORICAL = "https://apr.flashstake.io/historical";

const processItems = async (data) => {

  const pools = Object.keys(data);

  // This is the array we will append to
  let returnPayload = [];

  // Iterate over all the pools
  for(let slug of pools) {
    const poolData = data[slug];

    // Iterate over all the pool data points
    // @dev when "latest" API is used, this will only consist of 1 item
    // @dev when "historical" API is used, this can contain many items
    for(let poolDataItem of poolData) {
      const decimals = parseInt(poolDataItem['principalToken']['decimals']);
      const tvlInPrincipal = parseInt(poolDataItem['tvlInPrincipal']) / 10**decimals;
      const tvlInUSD = parseFloat(poolDataItem['principalToken']['tokenUSDCPrice']) * tvlInPrincipal;

      /*
        Note that this data is available if needed when processing historical
          blockNumber: poolDataItem['blockNumber']
          blockTimestamp: poolDataItem['blockTimestamp']
       */

      returnPayload.push({
        pool: `${poolDataItem['network']}:${poolDataItem['strategyAddress']}`.toLowerCase(),
        chain: poolDataItem['network'],
        project: 'flashstake',
        symbol: poolDataItem['principalToken']['symbol'],
        tvlUsd: tvlInUSD,
        apy: parseFloat(poolDataItem["apr"]),
        poolMeta: "1min lock"
      })
    }
  }

  return returnPayload.flat();
};

// @dev only returns the latest information
const getLatest = async() => {
  // Retrieve the data
  const data = await utils.getData(API_LATEST);

  return await processItems(data);
}

// @dev should be used sparingly to get historical data once
// @dev Leaving this here so you can generate historical data as per slasher125
/*
const getHistorical = async() => {
  const STARTING_POINT = 1659312000;  // Protocol deployment
  const MAX_INCREMENT = 604800;       // 7 days

  // Create an array of promises then resolve them at the same time
  let pointer = STARTING_POINT;
  let allData = {};
  while(Math.floor(Date.now() / 1000) > pointer) {
    const startTs = pointer;
    const endTs = pointer + MAX_INCREMENT;

    const endpoint = `${API_HISTORICAL}?startTimestamp=${startTs}&endTimestamp=${endTs}`
    const data = await utils.getData(endpoint);

    const pools = Object.keys(data);

    for(let pool of pools) {
      // If key does not exist, create it
      if(!Object.keys(allData).includes(pool)) {
        allData[pool] = [];
      }

      allData[pool].push(...data[pool]);
    }

    // The API returns inclusive so add 1
    pointer = endTs + 1;
  }

  return await processItems(allData);
}
 */

module.exports = {
  timetravel: false,
  apy: getLatest,
  url: 'https://app.flashstake.io/',
};
