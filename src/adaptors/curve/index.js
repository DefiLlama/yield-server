const utils = require('../utils');

const legacy = require('./legacy-adaptor');

const {CRV_API_BASE_URL, BLOCKCHAINIDS, BLOCKCHAINID_TO_REGISTRIES} = require('./config')

const getCurvePoolsInfo = async (blockchainId) => {
  poolInfo = {};
  for (const poolType of BLOCKCHAINID_TO_REGISTRIES[blockchainId]) {
    const uri = `/getPools/${blockchainId}/${poolType}`;
    let response;
    try {
      response = await utils.getData(CRV_API_BASE_URL + uri);
    } catch (error) {
      continue;
    }
    if (response?.success) {
      for (const pool of response.data.poolData) {
        poolInfo[pool.address] = {
          symbol: pool.coins.map((coin) => coin.symbol).join('-'),
          tvlUsd: pool.usdTotal,
        };
      }
    }
  }
  return poolInfo;
};

const getCurvePoolsAPY = async (blockchainId) => {
  const uri = `/getSubgraphData/${blockchainId}`;
  let response;
  try {
    response = await utils.getData(CRV_API_BASE_URL + uri);
  } catch (error) {
    return {};
  }
  const poolAPY = {};
  if (response?.success) {
    for (const pool of response.data.poolList) {
      poolAPY[pool.address] = { apy: pool.latestDailyApy * 100 };
    }
  }
  return poolAPY;
};

const main = async () => {
  const defillamaPooldata = [];

  results = BLOCKCHAINIDS.map((blockchainId) => {
    return Promise.all([
      getCurvePoolsInfo(blockchainId),
      getCurvePoolsAPY(blockchainId),
    ]).then((poolsInfoAndAPY) => {
      const [addressToPoolInfo, addressToPoolAPY] = poolsInfoAndAPY;
      for (const [address, poolInfo] of Object.entries(addressToPoolInfo)) {
        const pool = Object.assign(poolInfo, addressToPoolAPY[address]);

        if (pool.apy && pool.tvlUsd) {
          defillamaPooldata.push({
            pool: address + '-' + blockchainId,
            chain: blockchainId[0].toUpperCase() + blockchainId.slice(1),
            project: 'curve',
            symbol: pool.symbol,
            tvlUsd: pool.tvlUsd ? pool.tvlUsd : 0,
            apy: pool.apy ? pool.apy : 0,
          });
        }
      }
    });
  });

  try {
    await Promise.all(results);
  } catch (error) {
    console.error(error);
  }

  return defillamaPooldata;
};

module.exports = {
  timetravel: false,
  apy: main,
  // legacy needed by convex-finance adaptor
  curvePoolStats: legacy.curvePoolStats,
  tokenMapping: legacy.tokenMapping['ethereum'],
};
