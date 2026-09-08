const axios = require('axios');
const utils = require('../utils');

const POOL_API_URL = 'https://api-ui.native.org/api/v3/earn';
const CORE_INFO_URL = 'https://api.native.org/info';
const CORE_REGISTRY_URL = 'https://api-ui.native.org/api/v3/core/registry';
const USD_SCALE = 10n ** 8n;
const POOL_CHAIN = 'native_core';
const CHAIN_PRIORITY = ['ethereum', 'bsc', 'base', 'arbitrum', 'morph'];
const REQUEST_CONFIG = {
  headers: {
    'content-type': 'application/json',
    'user-agent': 'defillama-yield-adapter/1.0',
  },
  timeout: 30_000,
};

const parseAtoms = (value) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;

  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

const getChainPriority = (chainKey) => {
  const priority = CHAIN_PRIORITY.indexOf(chainKey);
  return priority === -1 ? CHAIN_PRIORITY.length : priority;
};

const postPoolRequest = async (body) => {
  const { data } = await axios.post(POOL_API_URL, body, REQUEST_CONFIG);

  if (data?.code !== 0 || !data.data) {
    throw new Error(
      `Native Core Pool ${body.type} failed: ${data?.message ?? 'no data'}`
    );
  }

  return data.data;
};

const fetchMarkPrices = async () => {
  const { data } = await axios.post(
    CORE_INFO_URL,
    { type: 'markPrices' },
    REQUEST_CONFIG
  );

  if (!Array.isArray(data?.mark_prices)) {
    throw new Error('Native Core markPrices returned no mark_prices array');
  }

  return new Map(
    data.mark_prices.map(({ asset_id: assetId, usd_atoms: usdAtoms }) => [
      assetId,
      usdAtoms,
    ])
  );
};

const fetchUnderlyings = async () => {
  const { data } = await axios.get(CORE_REGISTRY_URL, REQUEST_CONFIG);

  if (data?.code !== 0 || !Array.isArray(data.data?.chains)) {
    throw new Error(
      `Native Core registry failed: ${data?.message ?? 'no chains'}`
    );
  }

  const chains = [...data.data.chains].sort(
    (a, b) => getChainPriority(a.chainKey) - getChainPriority(b.chainKey)
  );
  const underlyingsByAssetId = new Map();

  for (const chain of chains) {
    if (!chain.enabled || !Array.isArray(chain.underlyings)) continue;

    for (const underlying of chain.underlyings) {
      if (
        !underlying.enabled ||
        !Number.isInteger(underlying.assetId) ||
        typeof underlying.nativeSymbol !== 'string' ||
        !/^0x[a-fA-F0-9]{40}$/.test(underlying.address) ||
        underlyingsByAssetId.has(underlying.assetId)
      ) {
        continue;
      }

      underlyingsByAssetId.set(underlying.assetId, {
        address: underlying.address.toLowerCase(),
        symbol: utils.formatSymbol(underlying.nativeSymbol),
      });
    }
  }

  return underlyingsByAssetId;
};

const calculateTvlUsd = (amount, decimals, usdAtoms) => {
  const amountAtoms = parseAtoms(amount);
  const priceAtoms = parseAtoms(String(usdAtoms));

  if (
    amountAtoms === null ||
    priceAtoms === null ||
    !Number.isInteger(decimals) ||
    decimals < 0
  ) {
    return null;
  }

  const tvlUsd =
    (Number(amountAtoms) / 10 ** decimals) *
    (Number(priceAtoms) / Number(USD_SCALE));

  return Number.isFinite(tvlUsd) && tvlUsd > 0 ? tvlUsd : null;
};

const formatApy = (projectedApy) => {
  if (projectedApy === undefined) return 0;

  const apy = Number(projectedApy) * 100;
  return Number.isFinite(apy) && apy >= 0 ? apy : 0;
};

const apy = async () => {
  const [config, pricesByAssetId, underlyingsByAssetId] = await Promise.all([
    postPoolRequest({ type: 'config' }),
    fetchMarkPrices(),
    fetchUnderlyings(),
  ]);

  if (!Array.isArray(config.assets)) {
    throw new Error('Native Core Pool config returned no assets array');
  }

  return config.assets
    .map((asset) => {
      if (
        typeof asset.symbol !== 'string' ||
        !Number.isInteger(asset.asset_id)
      ) {
        return null;
      }

      const symbol = utils.formatSymbol(asset.symbol);
      const tvlUsd = calculateTvlUsd(
        asset.realtime_tvl_amount,
        asset.balance_decimals,
        pricesByAssetId.get(asset.asset_id)
      );

      if (!tvlUsd) return null;

      const underlying = underlyingsByAssetId.get(asset.asset_id);
      const underlyingToken =
        underlying?.symbol === symbol ? underlying.address : undefined;

      return {
        pool: `native-core-clob-${asset.asset_id}`,
        chain: utils.formatChain(POOL_CHAIN),
        project: 'native-core-clob',
        symbol,
        tvlUsd,
        apyBase: formatApy(asset.projected_apy),
        ...(underlyingToken && {
          underlyingTokens: [underlyingToken],
          searchTokenOverride: underlyingToken,
        }),
        token: null,
        poolMeta: 'Native Pool',
        url: 'https://app.native.org',
      };
    })
    .filter(Boolean);
};

module.exports = {
  protocolId: '8535',
  timetravel: false,
  apy,
  url: 'https://native.org/',
};
