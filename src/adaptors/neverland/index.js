const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');
const poolAbi = require('../aave-v3/poolAbi');
const {
  dustRewardsControllerAbi,
  dustLockAbi,
  revenueRewardAbi,
} = require('./abi');

// Neverland exposes Aave V3 lending reserves plus veDUST. Lending rewards
// combine on-chain DUST emissions with Merkl incentives, which are blacklisted
// on the merkl adapter and so are included here. veDUST earns weekly protocol
// revenue.
const CHAIN = 'monad';
const PROJECT = 'neverland';
const APP_URL = 'https://app.neverland.money';

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
const WEEK = 7 * 24 * 60 * 60;
const WEEKS_PER_YEAR = 52;

// Shared singletons. The isolated markets deliberately reuse the canonical
// DustRewardsController, so one address covers every market listed below.
const rewardsController = '0x57ea245cCbFAb074baBb9d01d1F0c60525E52cec';
const dustLock = '0xBB4738D05AD1b3Da57a4881baE62Ce9bb1eEeD6C';
const revenueReward = '0xff20ac10eb808B1e31F5CfCa58D80eDE2Ba71c43';

// Canonical and isolated markets have independent providers and reserve sets.
// Isolated providers are not registered on-chain, so enumerate them explicitly.
const markets = [
  {
    name: 'Neverland Cross Market',
    protocolDataProvider: '0xfd0b6b6F736376F7B99ee989c749007c7757fDba',
    poolMeta: null,
    getUrl: (symbol) => `${APP_URL}/markets?asset=${symbol}`,
  },
  {
    name: 'Neverland Pendle AUSD Isolated Market',
    protocolDataProvider: '0xeEb78818C026A3c1b82804627d101e27Ce5E60CB',
    poolMeta: 'Pendle AUSD Isolated',
    getUrl: () => `${APP_URL}/isolated`,
  },
];

const priceKey = (address) => `${CHAIN}:${address}`;
const uniq = (values) => [...new Set(values.filter(Boolean))];
// aave rates are ray-scaled annualized rates; 1e25 turns a ray into a percent
const rayToPct = (rate) => Number(rate) / 1e25;

// none of the abis used here overload a name, so a name lookup is unambiguous
const findAbi = (abi, name) => abi.find((m) => m.name === name);

const call = async (target, abi, params) =>
  (await sdk.api.abi.call({ chain: CHAIN, target, abi, params })).output;

// Skip empty batches: rewardless markets legitimately produce them.
const multiCall = async (abi, calls) =>
  calls.length === 0
    ? []
    : (await sdk.api.abi.multiCall({ chain: CHAIN, abi, calls })).output.map(
        (o) => o.output
      );

// a single PoolDataProvider view, fetched once per reserve of a market
const byReserve = (protocolDataProvider, abiName, reserveTokens) =>
  multiCall(
    findAbi(poolAbi, abiName),
    reserveTokens.map((t) => ({
      target: protocolDataProvider,
      params: t.tokenAddress,
    }))
  );

const getDecimals = async (tokens) => {
  const decimals = await multiCall(
    'erc20:decimals',
    tokens.map((target) => ({ target }))
  );
  return Object.fromEntries(tokens.map((t, i) => [t, decimals[i]]));
};

const getPrices = async (tokens) =>
  tokens.length === 0
    ? {}
    : (
        await utils.getPriceApiData(
          `/prices/current/${tokens.map(priceKey).join(',')}`
        )
      ).coins;

// Missing asset keys distinguish no on-chain incentive (`null` APY) from a
// configured stream currently emitting zero (`0` APY).
const getEmissions = async (assets) => {
  const rewardsByAsset = await multiCall(
    findAbi(dustRewardsControllerAbi, 'getRewardsByAsset'),
    assets.map((asset) => ({ target: rewardsController, params: [asset] }))
  );

  const pairs = assets.flatMap((asset, i) =>
    (rewardsByAsset[i] || []).map((rewardToken) => ({ asset, rewardToken }))
  );

  // getRewardsData returns (index, emissionPerSecond, lastUpdate, end); the
  // rate and the end are what price the stream.
  const rewardsData = await multiCall(
    findAbi(dustRewardsControllerAbi, 'getRewardsData'),
    pairs.map(({ asset, rewardToken }) => ({
      target: rewardsController,
      params: [asset, rewardToken],
    }))
  );

  return pairs.reduce((acc, { asset, rewardToken }, i) => {
    const [, emissionPerSecond, , distributionEnd] = rewardsData[i];
    acc[asset] = [
      ...(acc[asset] || []),
      { rewardToken, emissionPerSecond, distributionEnd },
    ];
    return acc;
  }, {});
};

// emissionPerSecond stays set after distributionEnd; expired streams must not
// affect APY or reward-token metadata.
const liveEmissions = (emissions, timestamp) =>
  (emissions || []).filter(
    ({ distributionEnd }) => timestamp < Number(distributionEnd)
  );

const emissionRewardTokens = (emissions, timestamp) =>
  uniq(
    Object.values(emissions).flatMap((streams) =>
      liveEmissions(streams, timestamp).map((r) => r.rewardToken)
    )
  );

// Accept raw streams; expired or incomplete streams contribute zero.
const rewardApy = (emissions, rewardDecimals, prices, baseUsd, timestamp) => {
  if (!(baseUsd > 0)) return 0;
  return liveEmissions(emissions, timestamp).reduce(
    (acc, { rewardToken, emissionPerSecond }) => {
      const emission = Number(emissionPerSecond);
      const rewardPrice = prices[priceKey(rewardToken)]?.price;
      const decimals = rewardDecimals[rewardToken];
      if (!(emission > 0) || !rewardPrice || !decimals) return acc;
      const emissionUsdPerYear =
        (emission / 10 ** decimals) * SECONDS_PER_YEAR * rewardPrice;
      return acc + (emissionUsdPerYear / baseUsd) * 100;
    },
    0
  );
};

// Token-level reads are staged after reserve addresses are known.
const getMarketData = async ({ protocolDataProvider }) => {
  const reserveTokens = await call(
    protocolDataProvider,
    findAbi(poolAbi, 'getAllReservesTokens')
  );

  const [tokenAddresses, reserveData, configurationData, reserveCaps] =
    await Promise.all(
      [
        'getReserveTokensAddresses',
        'getReserveData',
        'getReserveConfigurationData',
        'getReserveCaps',
      ].map((abiName) =>
        byReserve(protocolDataProvider, abiName, reserveTokens)
      )
    );

  // taken per reserve rather than from getAllATokens() so the aToken and debt
  // token can never drift out of alignment with the reserve they belong to
  const aTokens = tokenAddresses.map((t) => t.aTokenAddress);
  const variableDebtTokens = tokenAddresses.map(
    (t) => t.variableDebtTokenAddress
  );

  // Keep gross supply, available liquidity and both reward sides.
  const [aTokenSupply, underlyingBalances, emissions] = await Promise.all([
    multiCall(
      'erc20:totalSupply',
      aTokens.map((target) => ({ target }))
    ),
    multiCall(
      'erc20:balanceOf',
      reserveTokens.map((t, i) => ({
        target: t.tokenAddress,
        params: [aTokens[i]],
      }))
    ),
    getEmissions([...aTokens, ...variableDebtTokens]),
  ]);

  return {
    reserveTokens,
    aTokens,
    variableDebtTokens,
    reserveData,
    configurationData,
    reserveCaps,
    aTokenSupply,
    underlyingBalances,
    emissions,
  };
};

// One pool per active, unfrozen reserve with complete USD data.
const buildMarketPools = (market, data, prices, rewardDecimals, timestamp) =>
  data.reserveTokens
    .map((reserve, i) => {
      const config = data.configurationData[i];
      if (!config.isActive || config.isFrozen) return null;

      // Missing prices cannot produce meaningful USD fields.
      const price = prices[priceKey(reserve.tokenAddress)]?.price;
      if (!price) return null;

      const reserveData = data.reserveData[i];
      const { supplyCap, borrowCap } = data.reserveCaps[i];
      const unit = 10 ** Number(config.decimals);

      const totalSupplyUsd = (Number(data.aTokenSupply[i]) / unit) * price;
      const tvlUsd = (Number(data.underlyingBalances[i]) / unit) * price;
      const totalBorrowUsd =
        ((Number(reserveData.totalStableDebt) +
          Number(reserveData.totalVariableDebt)) /
          unit) *
        price;
      // Aave caps are whole-token values; zero means uncapped.
      const borrowCapUsd = Number(borrowCap) * price;
      // Borrow availability is bounded by idle liquidity and the remaining cap.
      const availableBorrowUsd = Number(borrowCap)
        ? Math.max(Math.min(tvlUsd, borrowCapUsd - totalBorrowUsd), 0)
        : tvlUsd;

      const supplyEmissions = data.emissions[data.aTokens[i]];
      const borrowEmissions = data.emissions[data.variableDebtTokens[i]];
      const liveSupply = liveEmissions(supplyEmissions, timestamp);
      const liveBorrow = liveEmissions(borrowEmissions, timestamp);
      const rewardTokens = uniq(
        [...liveSupply, ...liveBorrow].map((r) => r.rewardToken)
      );

      // aToken IDs stay unique across providers; reward denominators follow the
      // rewarded position (gross supply or outstanding debt).
      return {
        pool: `${data.aTokens[i]}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: reserve.symbol,
        ...(market.poolMeta && { poolMeta: market.poolMeta }),
        tvlUsd,
        apyBase: rayToPct(reserveData.liquidityRate),
        apyReward: supplyEmissions
          ? rewardApy(
              supplyEmissions,
              rewardDecimals,
              prices,
              totalSupplyUsd,
              timestamp
            )
          : null,
        rewardTokens: rewardTokens.length > 0 ? rewardTokens : null,
        underlyingTokens: [reserve.tokenAddress],
        totalSupplyUsd,
        // Omit zero supplyCap because Aave uses it to mean uncapped.
        ...(Number(supplyCap) > 0 && {
          supplyCapUsd: Number(supplyCap) * price,
        }),
        totalBorrowUsd,
        availableBorrowUsd,
        apyBaseBorrow: rayToPct(reserveData.variableBorrowRate),
        apyRewardBorrow: borrowEmissions
          ? rewardApy(
              borrowEmissions,
              rewardDecimals,
              prices,
              totalBorrowUsd,
              timestamp
            )
          : null,
        ltv: Number(config.ltv) / 10000,
        url: market.getUrl(reserve.symbol),
        borrowable: config.borrowingEnabled,
        borrowToken: reserve.tokenAddress,
        // Collateral in one market cannot back debt in another, so borrow
        // routers must not pair reserves across markets.
        routeGroupKey: market.protocolDataProvider.toLowerCase(),
      };
    })
    .filter((pool) => pool !== null && utils.keepFinite(pool));

// veDUST annualizes upcoming protocol revenue against voting power.
// Its isolated pipeline lets revenue/RPC failures omit veDUST without
// suppressing lending.
const getVeDustPool = async () => {
  try {
    const [supply, dustToken, veDustSupply, rewardTokens] = await Promise.all([
      call(dustLock, findAbi(dustLockAbi, 'supply')),
      call(dustLock, findAbi(dustLockAbi, 'token')),
      call(dustLock, findAbi(dustLockAbi, 'totalSupply')),
      call(revenueReward, findAbi(revenueRewardAbi, 'getRewardTokens')),
    ]);

    // Use the upcoming epoch rather than already-distributed revenue.
    const nextEpoch =
      (Math.floor(Math.floor(Date.now() / 1000) / WEEK) + 1) * WEEK;
    const epochRewards = await multiCall(
      findAbi(revenueRewardAbi, 'tokenRewardsPerEpoch'),
      (rewardTokens || []).map((rewardToken) => ({
        target: revenueReward,
        params: [rewardToken, nextEpoch],
      }))
    );

    const data = {
      dustToken,
      supply,
      veDustSupply,
      rewardTokens: rewardTokens || [],
      epochRewards,
    };

    const [prices, rewardDecimals] = await Promise.all([
      getPrices(uniq([data.dustToken, ...data.rewardTokens])),
      getDecimals(data.rewardTokens),
    ]);
    return buildVeDustPool(data, prices, rewardDecimals);
  } catch (error) {
    console.error('Error loading veDUST pool:', error.message);
    return null;
  }
};

const buildVeDustPool = (data, prices, rewardDecimals) => {
  const dustPrice = prices[priceKey(data.dustToken)]?.price;
  if (!dustPrice || data.rewardTokens.length === 0) return null;

  const tvlUsd = (Number(data.supply) / 1e18) * dustPrice;
  const veDustPowerUsd = (Number(data.veDustSupply) / 1e18) * dustPrice;
  // Voting power decays independently of locked DUST; guard the denominator.
  if (!(tvlUsd > 0) || !(veDustPowerUsd > 0)) return null;

  // Revenue accrues to voting power, not locked principal.
  const apyReward = data.rewardTokens.reduce((acc, rewardToken, i) => {
    const rewardPrice = prices[priceKey(rewardToken)]?.price;
    const decimals = rewardDecimals[rewardToken];
    const weeklyRewards = Number(data.epochRewards[i]);
    if (!rewardPrice || !decimals || !(weeklyRewards > 0)) return acc;
    const annualRewardsUsd =
      (weeklyRewards / 10 ** decimals) * rewardPrice * WEEKS_PER_YEAR;
    return acc + (annualRewardsUsd / veDustPowerUsd) * 100;
  }, 0);

  return {
    pool: `${dustLock}-${CHAIN}`.toLowerCase(),
    chain: utils.formatChain(CHAIN),
    project: PROJECT,
    symbol: 'veDUST',
    tvlUsd,
    apyReward,
    rewardTokens: data.rewardTokens,
    underlyingTokens: [data.dustToken],
    // Locks are transferable veNFTs, not fungible pool tokens.
    token: null,
    url: APP_URL,
  };
};

// Isolate provider failures so one market cannot suppress another.
const getMarketDataSafe = async (market) => {
  try {
    return { market, data: await getMarketData(market) };
  } catch (error) {
    console.error(`Error loading ${market.name}:`, error.message);
    return null;
  }
};

const addApy = (baseApy, extraApy) =>
  extraApy > 0 ? (baseApy || 0) + extraApy : baseApy;

// Preserve schema: veDUST has no borrow side; lending may report null APY.
const hasBorrowApy = (pool) => pool.apyRewardBorrow !== undefined;

// The helper fills empty reward fields and normalizes target-APR campaigns.
// Blank them, run the helper, then add back on-chain APYs. On Merkl failure,
// addApy restores the originals.
const addMerklRewards = async (pools) => {
  // Re-associate by stable pool ID rather than helper output order.
  const ownPools = Object.fromEntries(pools.map((pool) => [pool.pool, pool]));

  const merklPools = await addMerklRewardApy(
    pools.map((pool) => ({
      ...pool,
      apyReward: null,
      ...(hasBorrowApy(pool) && { apyRewardBorrow: null }),
    })),
    PROJECT,
    // Pool ID prefixes are aTokens for lending and DustLock for veDUST.
    (pool) => pool.pool.split('-')[0]
  );

  return merklPools.map((pool) => {
    const own = ownPools[pool.pool];
    if (!own) return pool;

    return {
      ...pool,
      apyReward: addApy(own.apyReward, pool.apyReward),
      ...(hasBorrowApy(own) && {
        apyRewardBorrow: addApy(own.apyRewardBorrow, pool.apyRewardBorrow),
      }),
    };
  });
};

const apy = async () => {
  // Market providers and veDUST are independent, so resolve them concurrently.
  const [marketResults, veDustPool] = await Promise.all([
    Promise.all(markets.map(getMarketDataSafe)),
    getVeDustPool(),
  ]);
  const marketsData = marketResults.filter(Boolean);
  // Use one timestamp for token discovery and pool output.
  const rewardTimestamp = Math.floor(Date.now() / 1000);

  const rewardTokens = uniq(
    marketsData.flatMap(({ data }) =>
      emissionRewardTokens(data.emissions, rewardTimestamp)
    )
  );

  // Dedupe market lookups after provider isolation. A market-pricing outage
  // remains adapter-fatal because lending USD metrics cannot be emitted safely.
  const [prices, rewardDecimals] = await Promise.all([
    getPrices(
      uniq([
        ...marketsData.flatMap(({ data }) =>
          data.reserveTokens.map((t) => t.tokenAddress)
        ),
        ...rewardTokens,
      ])
    ),
    getDecimals(rewardTokens),
  ]);

  const pools = [
    ...marketsData.flatMap(({ market, data }) =>
      buildMarketPools(market, data, prices, rewardDecimals, rewardTimestamp)
    ),
    ...(veDustPool ? [veDustPool] : []),
  ].filter(Boolean);

  return addMerklRewards(pools);
};

module.exports = {
  protocolId: '7005',
  apy,
  url: APP_URL,
};
