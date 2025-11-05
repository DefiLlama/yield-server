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

    // APY with fallback: rolling30d -> rolling7d -> sec30d, then convert to %
    const apySrc =
      v?.apy?.rolling30d ??
      v?.apy?.rolling7d ??
      v?.apy?.sec30d ??
      undefined;
    const apy = apySrc !== undefined && apySrc !== null ? Number(apySrc) * 100 : undefined;

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
      url: `https://app.nest.credit/vault/${v.slug}`,
    };

    if (apy !== undefined) pool.apy = apy;
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
