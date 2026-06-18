const axios = require('axios');
const utils = require('../utils');

const API_URL = 'https://api-mainnet.oroswap.org/api/poolmanager/pools';
const APP_URL = 'https://app.oroswap.org/pools';
const CHAIN = 'ZIGChain';
const PROJECT = 'oroswap';
const PAGE_SIZE = 150;

const axiosConfig = {
  timeout: 30_000,
  headers: {
    accept: 'application/json',
    origin: 'https://app.oroswap.org',
    referer: 'https://app.oroswap.org/',
    'user-agent':
      'Mozilla/5.0 (compatible; DefiLlamaYields/1.0; +https://defillama.com)',
  },
};

const getAssetDenom = (asset) =>
  asset?.info?.native_token?.denom || asset?.info?.token?.contract_addr || null;

const getRewardDenom = (reward) =>
  reward?.asset_infos?.native_token?.denom ||
  reward?.asset_infos?.token?.contract_addr ||
  null;

const getPairType = (pairType) => {
  if (!pairType) return null;
  if (pairType.xyk !== undefined) return 'XYK';
  if (pairType.custom) return String(pairType.custom).toUpperCase();
  if (pairType.stable !== undefined) return 'Stable';
  return null;
};

const flattenPools = (data) =>
  ['xyk', 'custom', 'stable', 'pools']
    .flatMap((key) => (Array.isArray(data?.[key]) ? data[key] : []))
    .filter(Boolean);

const fetchPools = async () => {
  const pools = [];
  let offset = 0;
  let total = Infinity;

  try {
    while (offset < total) {
      const { data } = await axios.get(API_URL, {
        ...axiosConfig,
        params: { offset, limit: PAGE_SIZE },
      });

      const page = flattenPools(data);
      pools.push(...page);

      if (Number.isFinite(Number(data?.total))) {
        total = Number(data.total);
      }
      if (page.length === 0 || page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  } catch (error) {
    console.error(`Failed to fetch Oroswap pools: ${error.message}`);
  }

  return pools;
};

const toPool = (pool) => {
  const details = pool.details || {};
  const farmAssets = pool.farmDetails?.farm_assets || [];
  const tvlUsd = Number(details.liquidity || 0);
  const apyBase = Number(details.totalApr || 0);
  const apyReward = farmAssets.reduce(
    (sum, reward) => sum + Number(reward?.apr || 0),
    0
  );
  const rewardTokens = [
    ...new Set(farmAssets.map(getRewardDenom).filter(Boolean)),
  ];
  const underlyingTokens = pool.assets?.map(getAssetDenom).filter(Boolean) || [];
  const symbol =
    details.poolName ||
    pool.assets
      ?.map((asset) => asset.symbol)
      .filter(Boolean)
      .join('-') ||
    pool.pair_contract_addr;

  const mapped = {
    pool: `${pool.pair_contract_addr}-${CHAIN}`.toLowerCase(),
    chain: CHAIN,
    project: PROJECT,
    symbol: utils.formatSymbol(symbol),
    tvlUsd,
    apyBase,
    underlyingTokens,
    url: `${APP_URL}?pool=${pool.pair_contract_addr}`,
  };

  if (apyReward > 0) mapped.apyReward = apyReward;
  if (rewardTokens.length > 0) mapped.rewardTokens = rewardTokens;

  const pairType = getPairType(pool.pair?.pair_type);
  if (pairType) mapped.poolMeta = pairType;

  return mapped;
};

const apy = async () => {
  const seen = new Set();

  return (await fetchPools())
    .filter((pool) => {
      if (!pool?.pair_contract_addr || pool?.details?.is_pool_active === false) {
        return false;
      }
      if (seen.has(pool.pair_contract_addr)) return false;
      seen.add(pool.pair_contract_addr);
      return true;
    })
    .map(toPool)
    .filter((pool) => Number.isFinite(pool.tvlUsd) && pool.tvlUsd >= 0);
};

module.exports = {
  apy,
  timetravel: false,
  url: APP_URL,
};
