const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const legacy = require('./legacy-adaptor');
const {
  CRV_API_BASE_URL,
  BLOCKCHAINIDS,
  BLOCKCHAINID_TO_REGISTRIES,
} = require('./config');

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
      poolAPY[pool.address] = { apy: pool.latestDailyApy };
    }
  }
  return poolAPY;
};


const getGaugesByChain = async () => {
  
  const gaugeUri = '/getGauges';
  let gaugeResponse;
  let priceResponse;

  try {
    [priceResponse, gaugeResponse] = await Promise.all([utils.getCGpriceData("crv-dao-token"), utils.getData(CRV_API_BASE_URL + gaugeUri)])
  } catch (error) {
    return {};
  }
  const crv_price = priceResponse["crv-dao-token"].usd

  const blockchainRegExps = BLOCKCHAINIDS.filter(
    (blockchainId) => blockchainId !== 'ethereum'
  ).map((blockchainId) => new RegExp(`^(${blockchainId})-(.+)`));

  const gaugesDataByChain = Object.fromEntries(
    BLOCKCHAINIDS.map((blockchainId) => [blockchainId, {}])
  );
  for (const [gaugeName, gaugeDatum] of Object.entries(gaugeResponse.data.gauges)) {
    let match = null;
    for (const re of blockchainRegExps) {
      match = gaugeName.match(re);
      if (match) {
        break;
      }
    }
    // if no match, it's an ethereum gauge
    let blockchainId;
    let _gaugeDatum = {crvPerUsd: crv_price};
    let _gaugeName;
    if (!match) {
      _gaugeName = gaugeName;
      blockchainId = 'ethereum';
    } else {
      blockchainId = match[1];
      _gaugeName = match[2];
    }
    _gaugeDatum = Object.assign(_gaugeDatum, gaugeDatum, {
      gaugeName: _gaugeName,
    });
    gaugesDataByChain[blockchainId][_gaugeDatum.swap] = _gaugeDatum;
  }

  return gaugesDataByChain;
};

const getPoolAPR = (pool, gauge) => {
  const crvPrice = gauge.crvPerUsd
  // TODO: create BigNumber object and compute the values
  return (crv_price * inflation_rate * relative_weight * 12614400) / (working_supply * asset_price * virtual_price)
}


const main = async () => {
  const defillamaPooldata = [];

  // gaugeData is prerequisite for all chain data
  const gaugeDataPromise = getGaugesByChain();

  results = BLOCKCHAINIDS.map((blockchainId) => {
    return Promise.all([
      getCurvePoolsInfo(blockchainId),
      getCurvePoolsAPY(blockchainId),
      gaugeDataPromise,
    ]).then((poolData) => {
      const [addressToPoolInfo, addressToPoolAPY, addressToGauge] = poolData;
      for (const [address, poolInfo] of Object.entries(addressToPoolInfo)) {
        
        const pool = Object.assign(poolInfo, addressToPoolAPY[address]);
        const gauge = addressToGauge[address];

        defillamaPooldata.push({
          pool: address + '-' + blockchainId,
          chain: utils.formatChain(blockchainId),
          project: 'curve',
          symbol: pool.symbol,
          tvlUsd: pool.tvlUsd ? pool.tvlUsd : 0,
          apy: pool.apy ? pool.apy : 0,
          apr: gauge ? getPoolAPR(pool, gauge) : 0
        });
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
