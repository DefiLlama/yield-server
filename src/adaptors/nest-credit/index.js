// adapters/nest-vaults.js
const utils = require('../utils');

const DETAILS_URL = 'https://api.nest.credit/v1/vaults/details';
const PLUME_CHAIN_KEY = 'plume';
const PLUME_CHAIN_ID = 98866;

const poolsFunction = async () => {
  const res = await utils.getData(DETAILS_URL);
  const vaults = Array.isArray(res?.data) ? res.data : [];

  const pools = vaults.map((v) => {
    const address = (v.vaultAddress || '').toLowerCase();

    // Calculate 30-day APY
    const apy30dSrc = v?.apy?.rolling30d;
    const apy30day = apy30dSrc !== undefined && apy30dSrc !== null ? Number(apy30dSrc) * 100 : undefined;

    // Calculate 7-day APY
    const apy7dSrc = v?.apy?.rolling7d;
    const apy7day = apy7dSrc !== undefined && apy7dSrc !== null ? Number(apy7dSrc) * 100 : undefined;

    // Prefer Plume-native underlying tokens
    const underlyingTokens = (v.liquidAssets || [])
      .filter((a) => a?.chainId === PLUME_CHAIN_ID && a?.contractAddress)
      .map((a) => a.contractAddress.toLowerCase());

    const pool = {
      // ✅ pool = vault address (lowercased)
      pool: address,
      chain: utils.formatChain(PLUME_CHAIN_KEY),
      symbol: utils.formatSymbol(v.symbol || 'NEST'),
      tvlUsd: Number(v.tvl || 0),
      url: `https://app.nest.credit/vault/${v.slug}`,
    };

    if (apy30day !== undefined) pool.apy30day = apy30day;
    if (apy7day !== undefined) pool.apy7day = apy7day;
    if (underlyingTokens.length) pool.underlyingTokens = [...new Set(underlyingTokens)];

    return pool;
  });

  return pools.filter((p) => p.pool && p.chain && Number.isFinite(p.tvlUsd));
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.nest.credit',
};
