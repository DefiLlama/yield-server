const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const {
  CRV_API_BASE_URL,
  BLOCKCHAINIDS,
  BLOCKCHAINID_TO_REGISTRIES,
} = require('./config');

const assetTypeMapping = {
  btc: 'ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
  eth: 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
};

const THREE_CRV_ADDRESS = '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490';

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

const getPoolAPR = (pool, subgraph, gauge, crvPrice, underlyingPrices) => {
  if (gauge.is_killed) return 0;
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
  let poolAPR;
  try {
    if (
      pool.totalSupply &&
      !pool.coinsAddresses.includes(THREE_CRV_ADDRESS) &&
      pool.implementation !== 'metausd-fraxusdc'
    ) {
      poolAPR = inflationRate
        .times(relativeWeight)
        .times(31536000)
        .times(0.4)
        .div(workingSupply)
        .times(totalSupply)
        .div(pool.usdTotalExcludingBasePool)
        .times(crvPrice)
        .times(100);
    } else {
      assetPrice =
        pool.assetTypeName === 'usd'
          ? 1
          : underlyingPrices[assetTypeMapping[pool.assetTypeName]].price;
      poolAPR = crvPriceBN
        .times(inflationRate)
        .times(relativeWeight)
        .times(12614400)
        .div(workingSupply)
        .div(assetPrice)
        .div(virtualPrice)
        .times(100);
    }
  } catch (error) {
    return 0;
  }

  poolAPR = poolAPR.toNumber();

  return Number.isFinite(poolAPR) ? poolAPR : 0;
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
    BLOCKCHAINIDS.map((blockchainId) => [blockchainId, getPools(blockchainId)])
  );

  // we need the ethereum data first for the crv prive and await extra query to CG
  const ethereumPools = await blockchainToPoolPromise.ethereum;
  const priceCrv = getPriceCrv(Object.values(ethereumPools));

  // get wbtc and weth price which we use for reward APR in case totalSupply field = 0
  const underlyingPrices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: Object.values(assetTypeMapping),
    })
  ).body.coins;

  // create feeder closure to fill defillamaPooldata asynchroniously
  const defillamaPooldata = [];
  const feedLlama = async (poolData, blockchainId) => {
    const [
      addressToPool,
      addressToPoolSubgraph,
      addressToGauge,
      gaugeAddressToExtraRewards,
    ] = poolData;

    let factoryAprData;
    if (blockchainId === 'optimism') {
      factoryAprData = (
        await utils.getData('https://api.curve.fi/api/getFactoGauges/optimism')
      ).data.gauges;
    }

    const stETHPools = [
      '0xDC24316b9AE028F1497c275EB9192a3Ea0f67022',
      '0x6eB2dc694eB516B16Dc9FBc678C60052BbdD7d80',
    ];
    for (const [address, pool] of Object.entries(addressToPool)) {
      const subgraph = addressToPoolSubgraph[address];
      const gauge = addressToGauge[blockchainId][pool.gaugeAddress];
      // one gauge can have multiple (different) extra rewards
      const extraRewards = gaugeAddressToExtraRewards[pool.gaugeAddress];

      const apyBase = subgraph ? parseFloat(subgraph.latestDailyApy) : 0;
      const aprCrv =
        (blockchainId === 'optimism' && pool?.gaugeCrvApy?.length > 0) ||
        [
          '0xa1F8A6807c402E4A15ef4EBa36528A3FED24E577',
          '0x960ea3e3C7FB317332d990873d354E18d7645590',
          '0x7f90122BF0700F9E7e1F688fe926940E8839F353',
          '0x326290A1B0004eeE78fa6ED4F1d8f4b2523ab669',
          '0x6a6283aB6e31C2AeC3fA08697A8F806b740660b2',
          '0x13B876C26Ad6d21cb87AE459EaF6d7A1b788A113',
          '0x66E335622ad7a6C9c72c98dbfCCE684996a20Ef9',
          '0x3e3C6c7db23cdDEF80B694679aaF1bCd9517D0Ae',
          '0xFc1e8bf3E81383Ef07Be24c3FD146745719DE48D',
          '0x84C333e94AEA4a51a21F6cf0C7F528C50Dc7592C',
          '0xB755B949C126C04e0348DD881a5cF55d424742B2',
        ].includes(address)
          ? pool?.gaugeCrvApy[0]
          : gauge && subgraph
          ? getPoolAPR(pool, subgraph, gauge, priceCrv, underlyingPrices)
          : 0;
      let aprExtra = extraRewards
        ? extraRewards.map((reward) => reward.apy).reduce((a, b) => a + b)
        : stETHPools.includes(address) ||
          address === '0xFF6DD348e6eecEa2d81D4194b60c5157CD9e64f4' // pool on moonbeam
        ? pool.gaugeRewards[0].apy
        : 0;

      // tokens are listed using their contract addresses
      // https://github.com/DefiLlama/yield-server#adaptors
      const underlyingTokens = pool.coins.map((coin) => coin.address);
      const rewardTokens = extraRewards
        ? extraRewards.map((reward) => reward.tokenAddress)
        : stETHPools.includes(address)
        ? ['0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32'] // LDO
        : [];
      if (aprCrv) {
        rewardTokens.push('0xD533a949740bb3306d119CC777fa900bA034cd52'); // CRV
      }

      // separate reward tokens (eg OP on curve optimism), adding this to aprExtra if available
      if (blockchainId === 'optimism') {
        const x = factoryAprData.find(
          (x) => x.gauge?.toLowerCase() === pool.gaugeAddress?.toLowerCase()
        );
        const extraRewardsFactory = x?.extraRewards
          .filter((i) => i.apyData.isRewardStillActive)
          .map((i) => i.apy)
          .reduce((a, b) => a + b, 0);

        if (extraRewardsFactory > 0) {
          aprExtra += extraRewardsFactory;
          rewardTokens.push(x.extraRewards.map((i) => i.tokenAddress));
        }
      }
      // note(!) curve api uses coingecko prices and am3CRV is wrongly priced
      // this leads to pool.usdTotal to be inflated, going to hardcode temporarly hardcode this
      // to 1usd
      // am3CRV
      const am3CRV = '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171';
      const x = pool.coins.find((c) => c.address === am3CRV && c.usdPrice > 2);
      let tvlUsd;
      if (x) {
        tvlUsd = pool.coins
          .map((c) =>
            c.address === am3CRV
              ? (c.poolBalance / `1e${c.decimals}`) * 1
              : (c.poolBalance / `1e${c.decimals}`) * c.usdPrice
          )
          .reduce((a, b) => a + b, 0);
      } else {
        tvlUsd = pool.usdTotal;
      }

      if (tvlUsd < 1) {
        continue;
      }

      defillamaPooldata.push({
        pool: address + '-' + blockchainId,
        chain: utils.formatChain(blockchainId),
        project: 'curve',
        symbol: pool.coins.map((coin) => coin.symbol).join('-'),
        tvlUsd,
        apyBase,
        apyReward:
          // isolated pool for which the aprCrv is wrong
          [
            '0xBaaa1F5DbA42C3389bDbc2c9D2dE134F5cD0Dc89',
            '0x7f90122BF0700F9E7e1F688fe926940E8839F353',
          ].includes(address)
            ? null
            : aprCrv + aprExtra,
        rewardTokens: rewardTokens.flat(),
        underlyingTokens,
      });
    }
  };

  // group Promises by blockchain and feed the llama array
  const responses = [];
  for (const [blockchainId, poolPromise] of Object.entries(
    blockchainToPoolPromise
  )) {
    responses.push(
      Promise.all([
        poolPromise,
        blockchainToPoolSubgraphPromise[blockchainId],
        gaugePromise,
        extraRewardPromise,
      ]).then((poolData) => feedLlama(poolData, blockchainId))
    );
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
  url: 'https://curve.fi/pools',
};
