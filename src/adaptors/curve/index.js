const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const legacy = require('./legacy-adaptor');
const {
  CRV_API_BASE_URL,
  BLOCKCHAINIDS,
  BLOCKCHAINID_TO_REGISTRIES,
} = require('./config');

const getPools = async (blockchainId) => {
  const poolsByAddress = {};
  for (const registry of BLOCKCHAINID_TO_REGISTRIES[blockchainId]) {
    const uri = `/getPools/${blockchainId}/${registry}`;
    let response;
    try {
      response = await utils.getData(CRV_API_BASE_URL + uri);
    } catch (error) {
      continue;
    }
    if (response?.success) {
      const poolsByAddressForRegistry = Object.fromEntries(
        response.data.poolData.map((pool) => [pool.address, pool])
      );
      Object.assign(poolsByAddress, poolsByAddressForRegistry);
    }
  }
  return poolsByAddress;
};

const getSubGraphData = async (blockchainId) => {
  const uri = `/getSubgraphData/${blockchainId}`;
  let response;
  try {
    response = await utils.getData(CRV_API_BASE_URL + uri);
  } catch (error) {
    return {};
  }
  if (response?.success) {
    const poolSubgraphsByAddress = Object.fromEntries(
      response.data.poolList.map((pool) => [pool.address, pool])
    );
    return poolSubgraphsByAddress;
  } else {
    return {};
  }
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
    // gauge address on pools crv API is lowercase
    gaugesDataByChain[blockchainId][_gaugeDatum.gauge.toLowerCase()] =
      _gaugeDatum;
  }

  return gaugesDataByChain;
};

const getMainPoolGaugeRewards = async () => {
  const uri = '/getMainPoolsGaugeRewards';
  let response;
  try {
    response = await utils.getData(CRV_API_BASE_URL + uri);
    if (!response.success) {
      throw "call to '/getMainPoolsGaugeRewards' didn't succeed";
    }
    return response.data.mainPoolsGaugeRewards;
  } catch (error) {
    return {};
  }
};

const getPoolAPR = (pool, subgraph, gauge, crvPrice) => {
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
  const totalSupply = BigNumber(pool.totalSupply).div(decimals);

  const virtualPrice = BigNumber(subgraph.virtualPrice).div(decimals);
  const nominator = pool.coins
    .map((coin) => BigNumber(coin.poolBalance).times(coin.usdPrice))
    .reduce((a, b) => a.plus(b));
  const denominator = pool.coins
    .map((coin) => BigNumber(coin.poolBalance))
    .reduce((a, b) => a.plus(b));
  const assetPrice = nominator.div(denominator);
  try {
    const poolAPR = inflationRate
      .times(relativeWeight)
      .times(31536000)
      .times(0.4)
      .div(workingSupply)
      .times(totalSupply)
      .div(pool.usdTotalExcludingBasePool)
      .times(crvPrice)
      .times(100);
    return poolAPR.toNumber();
  } catch (error) {
    return 0;
  }
};

const getPriceCrv = (pools) => {
  //parse through pool coins and return price of crv dao token
  for (const coin of pools.map((pool) => pool.coins).flat()) {
    if (coin.address === '0xD533a949740bb3306d119CC777fa900bA034cd52') {
      return coin.usdPrice;
    }
  }
};

const main = async () => {
  // request promises
  const gaugePromise = getGaugesByChain();
  const extraRewardPromise = getMainPoolGaugeRewards();
  const blockchainToPoolSubgraphPromise = Object.fromEntries(
    BLOCKCHAINIDS.map((blockchainId) => [
      blockchainId,
      getSubGraphData(blockchainId),
    ])
  );
  const blockchainToPoolPromise = Object.fromEntries(
    BLOCKCHAINIDS.filter((blockchainId) => blockchainId !== 'ethereum').map(
      (blockchainId) => [blockchainId, getPools(blockchainId)]
    )
  );

  // we need the ethereum data first for the crv prive and await extra query to CG
  const ethereumPools = await getPools('ethereum');
  const priceCrv = getPriceCrv(Object.values(ethereumPools));

  // create feeder closure to fill defillamaPooldata asynchroniously
  const defillamaPooldata = [];
  const feedLlama = (poolData, blockchainId) => {
    const [
      addressToPool,
      addressToPoolSubgraph,
      addressToGauge,
      gaugeAddressToExtraRewards,
    ] = poolData;
    for (const [address, pool] of Object.entries(addressToPool)) {
      const subgraph = addressToPoolSubgraph[address];
      const gauge = addressToGauge[blockchainId][pool.gaugeAddress];
      // one gauge can have multiple (different) extra rewards
      const extraRewards = gaugeAddressToExtraRewards[pool.gaugeAddress];

      const apyBase = subgraph ? parseFloat(subgraph.latestDailyApy) : 0;
      const aprCrv =
        gauge && subgraph ? getPoolAPR(pool, subgraph, gauge, priceCrv) : 0;
      const aprExtra = extraRewards
        ? extraRewards.map((reward) => reward.apy).reduce((a, b) => a + b)
        : 0;

      // tokens are listed using their contract addresses
      // https://github.com/DefiLlama/yield-server#adaptors
      const underlyingTokens = pool.coins.map((coin) => coin.address);
      const rewardTokens = extraRewards
        ? extraRewards.map((reward) => reward.tokenAddress)
        : [];
      if (aprCrv) {
        rewardTokens.push('0xD533a949740bb3306d119CC777fa900bA034cd52'); // CRV
      }

      const tvlUsd = pool.usdTotal;
      if (!tvlUsd) {
        continue;
      }

      defillamaPooldata.push({
        pool: address + '-' + blockchainId,
        chain: utils.formatChain(blockchainId),
        project: 'curve',
        symbol: pool.coins.map((coin) => coin.symbol).join('-'),
        tvlUsd,
        apyBase,
        apyReward: aprCrv + aprExtra,
        rewardTokens,
        underlyingTokens,
      });
    }
  };

  // group Promises by blockchain and feed the llama array
  const responses = [];
  for (const [blockchainId, poolSubgraphPromise] of Object.entries(
    blockchainToPoolSubgraphPromise
  )) {
    // we already have ethererum for the crv price
    if (blockchainId !== 'ethereum') {
      responses.push(
        Promise.all([
          blockchainToPoolPromise[blockchainId],
          poolSubgraphPromise,
          gaugePromise,
          extraRewardPromise,
        ]).then((poolData) => feedLlama(poolData, blockchainId))
      );
    } else {
      responses.push(
        Promise.all([
          poolSubgraphPromise,
          gaugePromise,
          extraRewardPromise,
        ]).then((APYandGaugeData) =>
          feedLlama([ethereumPools, ...APYandGaugeData], blockchainId)
        )
      );
    }
  }

  // wait for all Group promises to resolve
  try {
    await Promise.all(responses);
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
  tokenMapping: legacy.tokenMapping,
};
