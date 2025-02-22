const utils = require('../utils');

const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const { format } = require('date-fns');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');

const graphEndpoint = sdk.graph.modifyEndpoint('GiBzr9juc4hMmyj6KstUnoaacux4wB5jsdgCV38W3Zwt');

const query = gql`
  {
    pools {
      series {
        maturity
        adapter
        pt
        underlying
        underlyingName
        targetName
        target
        decimals
        issuance
        adapterMeta {
          number
        }
      }
      targetBalance
      pTBalance
      underlyingVolume
      initScale
      ts
      lpShareTotalSupply
      impliedRate
      address
    }
  }
`;

const abi = {
  scale: {
    inputs: [],
    name: 'scale',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
};

const ONE_DAY_SECONDS = 24 * 60 * 60;
const ONE_YEAR_DAYS = 365;
const SECONDS_PER_YEAR = ONE_DAY_SECONDS * ONE_YEAR_DAYS;

const targetToTicker = (target) => {
  if (target === 'wstETH') {
    return 'stETH';
  } else {
    return target;
  }
};

const underlyingToTicker = (underlying) => {
  if (underlying === 'WETH') {
    return 'ETH';
  } else {
    return underlying;
  }
};

const toISODate = (timestamp) =>
  new Date(timestamp * 1000).toISOString().substr(0, 10);

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .map((address) => `ethereum:${address}`)
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
};

const calculateSpaceData = async (pool, targetPrices) => {
  const ttm =
    parseInt(pool.series.maturity) - Math.floor(new Date().getTime() / 1000);

  if (ttm <= 0) {
    // If the pool is past maturity, it's essentially just wrapped Target w.o. rewards
    return [
      pool.targetAPYBase.toString(),
      new BigNumber(pool.targetBalance)
        .plus(pool.pTBalance)
        .times(targetPrices[pool.series.target])
        .toNumber(),
    ];
  }

  let { output: scale } = await sdk.api.abi.call({
    target: pool.series.adapter,
    abi: abi.scale,
    chain: 'ethereum',
  });
  scale = new BigNumber(scale).div('1e+18');

  const rate = new BigNumber(pool.impliedRate).div(100);
  const stretchedRate = new BigNumber(
    rate.plus(1).toNumber() **
      new BigNumber(1)
        .div(new BigNumber(pool.ts).times(SECONDS_PER_YEAR))
        .toNumber()
  ).minus(1);

  const targetPerPT = new BigNumber(1)
    .div(
      stretchedRate.plus(1).toNumber() **
        new BigNumber(ttm).times(pool.ts).toNumber()
    )
    .div(scale);

  const targetInUnderlying = new BigNumber(pool.targetBalance).times(scale);
  const ptInUnderlying = new BigNumber(pool.pTBalance)
    .times(targetPerPT)
    .times(scale);
  const total = ptInUnderlying.plus(targetInUnderlying);
  const weightedPTApy = new BigNumber(pool.impliedRate).times(
    ptInUnderlying.div(total)
  );
  const weightedTargetApy = new BigNumber(pool.targetAPYBase).times(
    targetInUnderlying.div(total)
  );

  const timeSinceInit =
    Math.floor(new Date().getTime() / 1000) - parseInt(pool.series.issuance);

  // Extrapolate the volume we've seen since issuance out into a yearly value (note that this is a very rough estimate).
  const estVolumePerYear = new BigNumber(pool.underlyingVolume)
    .div(timeSinceInit / ONE_DAY_SECONDS)
    .times(ONE_YEAR_DAYS);
  // Space fees are taken as a percent of yield, so use the current PT implied rate as the base yield from which to take.
  // Then, determine the percent of the current pool our estimated yearly volume is (even if the pool won't be around for a year,
  // since we're calculating apy) and use that to weight the avg additional underlying we collect per underlying traded.
  const estYieldFromFees = new BigNumber(pool.impliedRate)
    .div(100)
    .times(0.05)
    .times(estVolumePerYear.div(total));

  const targetTvl = new BigNumber(pool.targetBalance).times(
    targetPrices[pool.series.target]
  );
  const ptTvl = BigNumber(pool.pTBalance)
    .times(targetPerPT)
    .times(targetPrices[pool.series.target]);

  return [
    // Take the apy as the weighted sum of the Target and PT APYs, plus the estimated yield from fees.
    weightedPTApy.plus(weightedTargetApy).plus(estYieldFromFees).toString(),
    targetTvl.plus(ptTvl).toNumber(),
  ];
};

const main = async () => {
  let { pools } = await request(graphEndpoint, query);

  const yields = (await superagent.get('https://yields.llama.fi/pools')).body
    .data;

  pools = pools.map((pool) => {
    const y = yields
      .filter((y) => y.symbol === targetToTicker(pool.series.targetName))
      .reduce(
        (acc, cur) =>
          acc === null ? cur : cur.tvlUsd > acc.tvlUsd ? cur : acc,
        null
      );

    if (y == null) return pool;

    return { targetAPYBase: y.apyBase, targetAPY: y.apy, ...pool };
  });

  const targetTokens = [...new Set(pools.map((pool) => pool.series.target))];
  const targetPrices = await getPrices(targetTokens);

  const ptAdapterMap = {};
  for (const { series } of pools) {
    const { pt, adapter } = series;
    ptAdapterMap[pt] = adapter;
  }

  const adapterDecimalsMap = {};
  for (const { series } of pools) {
    const { decimals, adapter } = series;
    adapterDecimalsMap[adapter] = decimals; // Decimals are constant for all Series of a particular adapter
  }

  const ptTotalSupplys = new Map(
    await Promise.all(
      Object.entries(ptAdapterMap).map(async ([ptToken, adapterAddress]) => [
        ptToken,
        new BigNumber(
          (
            await sdk.api.erc20.totalSupply({
              target: ptToken,
              chain: 'ethereum',
            })
          ).output
        )
          .div(10 ** parseInt(adapterDecimalsMap[adapterAddress]))
          .toString(),
      ])
    )
  );

  // SENSE PTS
  const pts = pools.map((pool) => ({
    pool: pool.series.pt,
    chain: 'Ethereum',
    project: 'sense',
    symbol: `PT-${underlyingToTicker(pool.series.underlyingName)} ${
      pool.series.targetName
    }-${pool.series.adapterMeta.number}`,
    tvlUsd: new BigNumber(ptTotalSupplys.get(pool.series.pt))
      .times(targetPrices[pool.series.target])
      .toNumber(),
    apyBase: parseFloat(pool.impliedRate),
    apyReward: 0,
    rewardTokens: [],
    underlyingTokens: [pool.series.underlying],
    poolMeta: `Maturing ${toISODate(pool.series.maturity)}`,
  }));

  pools = await Promise.all(
    pools
      .filter((pool) => !!pool.targetAPYBase)
      .map(async (pool) => {
        const [apyBase, tvlUsd] = await calculateSpaceData(pool, targetPrices);
        return {
          apyBase,
          tvlUsd,
          ...pool,
        };
      })
  );

  // SENSE SPACE POOLS
  const spacePools = pools.map((pool) => ({
    pool: pool.address,
    chain: 'Ethereum',
    project: 'sense',
    symbol: `SPACE-${pool.series.targetName}`,
    tvlUsd: pool.tvlUsd,
    apyBase: parseFloat(pool.apyBase),
    apyReward: 0,
    rewardTokens: [],
    underlyingTokens: [pool.series.pt, pool.series.target],
    poolMeta: `Maturing ${toISODate(pool.series.maturity)}`,
  }));

  return [...pts, ...spacePools].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.sense.finance',
};
