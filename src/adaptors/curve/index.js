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
          coins: pool.coins
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
  try {
    gaugeResponse = await utils.getData(CRV_API_BASE_URL + gaugeUri);
  } catch (error) {
    return {};
  }

  const blockchainRegExps = BLOCKCHAINIDS.filter(
    (blockchainId) => blockchainId !== 'ethereum'
  ).map((blockchainId) => new RegExp(`^(${blockchainId})-(.+)`));

  const gaugesDataByChain = Object.fromEntries(
    BLOCKCHAINIDS.map((blockchainId) => [blockchainId, {}])
  );
  for (const [gaugeName, gaugeDatum] of Object.entries(
    gaugeResponse.data.gauges
  )) {
    let match = null;
    for (const re of blockchainRegExps) {
      match = gaugeName.match(re);
      if (match) {
        break;
      }
    }
    // if no match, it's an ethereum gauge
    let blockchainId;
    let _gaugeName;
    if (!match) {
      _gaugeName = gaugeName;
      blockchainId = 'ethereum';
    } else {
      blockchainId = match[1];
      _gaugeName = match[2];
    }
    const _gaugeDatum = Object.assign(
      {
        gaugeName: _gaugeName,
      },
      gaugeDatum
    );
    gaugesDataByChain[blockchainId][_gaugeDatum.gauge] = _gaugeDatum;
  }

  return gaugesDataByChain;
};

const getPoolAPR = (pool, gauge, crvPrice) => {
  const crvPriceBN = BigNumber(crvPrice);
  const decimals = BigNumber(1e18);
  const workingSupply = BigNumber(gauge.gauge_data.working_supply).div(
    decimals
  );
  const inflationRate = BigNumber(gauge.gauge_data.inflation_rate).div(
    decimals
  );
  const relativeWeight = BigNumber(
    gauge.gauge_controller.gauge_relative_weight
  ).div(decimals);

  const virtualPrice = BigNumber(pool.virtual_price).div(decimals);
  const nominator = pool.coins
    .mapped((coin) => BigNumber(coin.poolBalance).mul(coin.usdPrice))
    .reduce((a, b) => a.plus(b));
  const denominator = pool.coins
    .mapped((coin) => BigNumber(coin.poolBalance))
    .reduce((a, b) => a.plus(b));
  const assetPrice = nominator.div(denominator);
  try {
    const poolAPR = crvPriceBN
      .mul(inflationRate)
      .mul(relativeWeight)
      .mul(12614400)
      .div(workingSupply)
      .div(assetPrice)
      .div(virtualPrice);
    return poolAPR.toNumber();
  } catch (error) {
    return 0;
  }
};

const getCrvPrice = (pools) => {
  //parse through pool coins and return price of crv dao token
  for (const coin of pools.map((pool) => pool.coins).flat()) {
    if (coin.address === '0xD533a949740bb3306d119CC777fa900bA034cd52') {
      return coin.usdPrice;
    }
  }
};

const main = async () => {
  const defillamaPooldata = [];

  // gaugeData is prerequisite for all chain data
  const gaugeDataPromise = getGaugesByChain();
  const blockchainToPoolAPYPromise = Object.fromEntries(
    BLOCKCHAINIDS.map((blockchainId) => [
      blockchainId,
      getCurvePoolsAPY(blockchainId),
    ])
  );
  const blockchainToPoolinfoPromise = Object.fromEntries(
    BLOCKCHAINIDS.filter(blockchainId => blockchainId !== 'ethereum').map((blockchainId) => [
      blockchainId,
      getCurvePoolsInfo(blockchainId),
    ])
  );

  const ethereumPoolinfos = await getCurvePoolsInfo('ethereum');
  const crvPrice = getCrvPrice(Object.values(ethereumPoolinfos));
  // block until all poolInfos are received

  const feedLlama = (poolData, blockchainId) => {
    const [addressToPoolInfo, addressToPoolAPY, addressToGauge] = poolData;
    for (const [address, poolInfo] of Object.entries(addressToPoolInfo)) {
      const pool = Object.assign(poolInfo, addressToPoolAPY[address]);
      // TODO: gauge lookup not working correctly -> debug
      const gauge = addressToGauge[blockchainId][pool.gaugeAddress];

      defillamaPooldata.push({
        pool: address + '-' + blockchainId,
        chain: utils.formatChain(blockchainId),
        project: 'curve',
        symbol: pool.symbol,
        tvlUsd: pool.tvlUsd ? pool.tvlUsd : 0,
        apy: pool.apy ? pool.apy : 0,
        apr: gauge ? getPoolAPR(pool, gauge, crvPrice) : 0,
      });
    }
  };

  results = [];
  for (const [blockchainId, poolAPYPromise] of Object.entries(blockchainToPoolAPYPromise)) {
    if (blockchainId !== 'ethereum') {
      results.push(
        Promise.all([
          blockchainToPoolinfoPromise[blockchainId],
          poolAPYPromise,
          gaugeDataPromise,
        ]).then(poolData => feedLlama(poolData, blockchainId))
      );
    } else {
      results.push(
        Promise.all([
          poolAPYPromise,
          gaugeDataPromise,
        ]).then((APYandGaugeData) =>
          feedLlama([ethereumPoolinfos, ...APYandGaugeData], blockchainId)
        )
      );
    }
  }
 

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
