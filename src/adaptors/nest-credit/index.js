// adapters/nest-vaults.js
const utils = require('../utils');

const DETAILS_URL = 'https://api.nest.credit/v1/vaults/details?live=true';
const PLUME_CHAIN_KEY = 'plume';
const PLUME_CHAIN_ID = 98866;

const poolsFunction = async () => {
  const res = await utils.getData(DETAILS_URL);
  const vaults = Array.isArray(res?.data) ? res.data : [];

  const pools = vaults.map((v) => {
    const address = (v.vaultAddress || '').toLowerCase();

    // Calculate 7-day APY, fallback to 0 if empty
    const apy7dSrc = v?.apy?.rolling7d;
    let apyBase = 0; // Default to 0 if empty

    if (apy7dSrc !== undefined && apy7dSrc !== null && apy7dSrc !== '') {
      const apy7day = Number(apy7dSrc) * 100;
      if (Number.isFinite(apy7day)) {
        apyBase = apy7day;
      }
    }

    // Prefer Plume-native underlying tokens
    const underlyingTokens = (v.liquidAssets || [])
      .filter((a) => a?.chainId === PLUME_CHAIN_ID && a?.contractAddress)
      .map((a) => a.contractAddress.toLowerCase());

    const pool = {
      // ✅ pool = vault address (lowercased)
      pool: address,
      chain: utils.formatChain(PLUME_CHAIN_KEY),
      project: 'nest-credit',
      symbol: utils.formatSymbol(v.symbol || 'NEST'),
      tvlUsd: Number(v.tvl || 0),
      apyBase: apyBase,
      url: `https://app.nest.credit/vaults/${v.slug}`,
    };

    // Set underlying tokens if available
    if (underlyingTokens.length) {
      pool.underlyingTokens = [...new Set(underlyingTokens)];
    }

    return pool;
  });

  return pools.filter((p) => p.pool && p.chain && Number.isFinite(p.tvlUsd));
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.nest.credit',
};
