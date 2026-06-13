const sdk = require('@defillama/sdk');
const utils = require('../utils');

const ALADDIN_API_BASE_URL = 'https://api.aladdin.club/';
const CHAIN = 'ethereum';
const PROJECT = 'concentrator';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ETH_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const CURVE_META_REGISTRY = '0xF98B45FA17DE75FB1aD0e7aFD971b0ca00e379fC';
const CURVE_COIN_INDEXES = Array.from({ length: 8 }, (_, i) => i);
const ATOKEN_KEYS = [
  'aCRV',
  'asdCRV',
  'aladdinCVX',
  'arUSD',
  'fxSave',
  'asdPENDLE',
];
const ATOKEN_SYMBOLS = {
  aladdinCVX: 'aCVX',
};

const ABIS = {
  curvePoolFromLpToken:
    'function get_pool_from_lp_token(address) view returns (address)',
  curveUnderlyingCoins:
    'function get_underlying_coins(address) view returns (address[8])',
  curveCoins: 'function get_coins(address) view returns (address[8])',
  coinsUint: 'function coins(uint256) view returns (address)',
  coinsInt: 'function coins(int128) view returns (address)',
  asset: 'address:asset',
  underlying: 'address:underlying',
};

const uniqueAddresses = (addresses) => [
  ...new Map(
    addresses.filter(Boolean).map((address) => [address.toLowerCase(), address])
  ).values(),
];

const normalizeToken = (token) => {
  if (!token || token.toLowerCase() === ZERO_ADDRESS) return null;
  if (token.toLowerCase() === ETH_SENTINEL.toLowerCase()) return ZERO_ADDRESS;
  return token;
};

const cleanTokens = (tokens) => {
  const tokenList =
    typeof tokens === 'string'
      ? [tokens]
      : Array.isArray(tokens)
      ? tokens
      : Object.values(tokens || {});

  return uniqueAddresses(tokenList.map(normalizeToken));
};

const getAllPools = async () => {
  const vaultsInfo = await utils.getData(
    `${ALADDIN_API_BASE_URL}api1/concentrator_pool_tvl_apy`
  );

  return (vaultsInfo.data || []).map((item) => ({
    tvl: item.tvl,
    apy: item.apy.proApy,
    symbol: item.lpName,
    lpToken: item.address,
  }));
};

const getCurvePoolByLpToken = async (lpTokens) => {
  const calls = lpTokens.map((lpToken) => ({
    target: CURVE_META_REGISTRY,
    params: [lpToken],
  }));

  const { output } = await sdk.api.abi.multiCall({
    chain: CHAIN,
    abi: ABIS.curvePoolFromLpToken,
    calls,
    permitFailure: true,
  });

  return lpTokens.reduce((acc, lpToken, i) => {
    const pool = normalizeToken(output[i]?.output) || lpToken;
    acc[lpToken.toLowerCase()] = pool;
    return acc;
  }, {});
};

const getMetaRegistryCoins = async (pools, abi) => {
  const calls = pools.map((pool) => ({
    target: CURVE_META_REGISTRY,
    params: [pool],
  }));

  const { output } = await sdk.api.abi.multiCall({
    chain: CHAIN,
    abi,
    calls,
    permitFailure: true,
  });

  return pools.reduce((acc, pool, i) => {
    const coins = cleanTokens(output[i]?.output);
    if (coins.length) acc[pool.toLowerCase()] = coins;
    return acc;
  }, {});
};

const getDirectPoolCoinsByAbi = async (pools, abi) => {
  const calls = pools.flatMap((pool) =>
    CURVE_COIN_INDEXES.map((index) => ({ target: pool, params: [index] }))
  );

  const { output } = await sdk.api.abi.multiCall({
    chain: CHAIN,
    abi,
    calls,
    permitFailure: true,
  });

  return pools.reduce((acc, pool, poolIndex) => {
    const start = poolIndex * CURVE_COIN_INDEXES.length;
    const coins = cleanTokens(
      CURVE_COIN_INDEXES.map(
        (_, coinIndex) => output[start + coinIndex]?.output
      )
    );

    if (coins.length) acc[pool.toLowerCase()] = coins;
    return acc;
  }, {});
};

const getDirectPoolCoins = async (pools) => {
  const [uintCoins, intCoins] = await Promise.all([
    getDirectPoolCoinsByAbi(pools, ABIS.coinsUint),
    getDirectPoolCoinsByAbi(pools, ABIS.coinsInt),
  ]);

  return pools.reduce((acc, pool) => {
    const poolKey = pool.toLowerCase();
    const coins = cleanTokens([
      ...(uintCoins[poolKey] || []),
      ...(intCoins[poolKey] || []),
    ]);

    if (coins.length) acc[poolKey] = coins;
    return acc;
  }, {});
};

const getCurveUnderlyingTokens = async (lpTokenAddresses) => {
  const lpTokens = uniqueAddresses(lpTokenAddresses);
  if (!lpTokens.length) return {};

  const poolByLpToken = await getCurvePoolByLpToken(lpTokens);
  const curvePools = uniqueAddresses(Object.values(poolByLpToken));

  const [underlyingByPool, coinsByPool] = await Promise.all([
    getMetaRegistryCoins(curvePools, ABIS.curveUnderlyingCoins),
    getMetaRegistryCoins(curvePools, ABIS.curveCoins),
  ]);

  const poolsMissingCoins = curvePools.filter((pool) => {
    const poolKey = pool.toLowerCase();
    return !underlyingByPool[poolKey]?.length && !coinsByPool[poolKey]?.length;
  });

  const directCoinsByPool = poolsMissingCoins.length
    ? await getDirectPoolCoins(poolsMissingCoins)
    : {};

  return lpTokens.reduce((acc, lpToken) => {
    const pool = poolByLpToken[lpToken.toLowerCase()];
    const poolKey = pool.toLowerCase();
    const underlyingTokens =
      underlyingByPool[poolKey] ||
      coinsByPool[poolKey] ||
      directCoinsByPool[poolKey];

    if (underlyingTokens?.length) acc[lpToken.toLowerCase()] = underlyingTokens;
    return acc;
  }, {});
};

const getATokenMetadata = async (aTokenAddresses) => {
  const calls = aTokenAddresses.map((target) => ({ target }));

  const [assets, underlyings] = await Promise.all([
    sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: ABIS.asset,
      calls,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: ABIS.underlying,
      calls,
      permitFailure: true,
    }),
  ]);

  return aTokenAddresses.reduce((acc, address, i) => {
    const asset = normalizeToken(assets.output[i]?.output);
    const underlying = normalizeToken(underlyings.output[i]?.output);
    const underlyingTokens = cleanTokens([asset || underlying]);

    acc[address.toLowerCase()] = {
      underlyingTokens,
    };
    return acc;
  }, {});
};

const getATokenData = async () => {
  const aTokenData = await utils.getData(
    `${ALADDIN_API_BASE_URL}api1/concentrator_aToken_tvl_apy`
  );

  const aTokens = ATOKEN_KEYS.map((key) => [
    key,
    aTokenData.data?.[key],
  ]).filter(
    ([, item]) =>
      item?.address && item?.tvl !== undefined && item?.apy !== undefined
  );
  const metadata = await getATokenMetadata(
    aTokens.map(([, item]) => item.address)
  );

  return aTokens.map(([fallbackSymbol, item]) => {
    const tokenMetadata = metadata[item.address.toLowerCase()] || {};
    const underlyingTokens = tokenMetadata.underlyingTokens || [];

    return {
      pool: `${item.address}-concentrator`,
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: ATOKEN_SYMBOLS[fallbackSymbol] || fallbackSymbol,
      tvlUsd: parseInt(item.tvl, 10),
      apy: parseFloat(item.apy),
      ...(underlyingTokens.length && { underlyingTokens }),
    };
  });
};

const buildPool = (entry, underlyingTokensByLpToken) => {
  const underlyings = underlyingTokensByLpToken[entry.lpToken.toLowerCase()];

  return {
    pool: `${entry.lpToken}-${PROJECT}`.toLowerCase(),
    chain: utils.formatChain(CHAIN),
    project: PROJECT,
    symbol: entry.symbol,
    tvlUsd: parseInt(entry.tvl, 10),
    apy: parseFloat(entry.apy),
    ...(underlyings?.length && { underlyingTokens: underlyings }),
  };
};

const main = async () => {
  const dataInfo = await getAllPools();
  const [underlyingTokensByLpToken, aTokenData] = await Promise.all([
    getCurveUnderlyingTokens(dataInfo.map(({ lpToken }) => lpToken)),
    getATokenData(),
  ]);

  return dataInfo
    .map((entry) => buildPool(entry, underlyingTokensByLpToken))
    .concat(aTokenData)
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://concentrator.aladdin.club/#/vault',
};
