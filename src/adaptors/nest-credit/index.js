// adapters/nest-vaults.js
const utils = require('../utils');

const DETAILS_URL = 'https://api.nest.credit/v1/vaults/details?live=true';
const POSITIONS_URL = 'https://api.nest.credit/v1/vaults';
const PLUME_CHAIN_KEY = 'plume';
const PLUME_CHAIN_ID = 98866;

const getPlumePusd = (vault) =>
  (vault.liquidAssets || [])
    .find(
      (asset) =>
        asset?.chainId === PLUME_CHAIN_ID &&
        asset?.symbol === 'pUSD' &&
        asset?.contractAddress
    )
    ?.contractAddress.toLowerCase();

const getUnderlyingTokens = async (slug) => {
  try {
    const res = await utils.getData(`${POSITIONS_URL}/${slug}/positions`);
    const yieldAssets = res?.data?.positions?.yieldAssets || [];
    const tokens = yieldAssets
      .flatMap((asset) => asset?.tokens || [])
      .filter(
        (token) =>
          token?.chainId === PLUME_CHAIN_ID &&
          token?.tokenAddress &&
          Number(token?.position?.value || 0) > 0
      )
      .map((token) => token.tokenAddress.toLowerCase());

    return [...new Set(tokens)];
  } catch {
    return [];
  }
};

const poolsFunction = async () => {
  const res = await utils.getData(DETAILS_URL);
  const vaults = Array.isArray(res?.data) ? res.data : [];

  const pools = await Promise.all(
    vaults.map(async (v) => {
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

      const pusd = getPlumePusd(v);
      const underlyingTokens = await getUnderlyingTokens(v.slug);
      if (!underlyingTokens.length && pusd) {
        underlyingTokens.push(pusd);
      }

      const pool = {
        // ✅ pool = vault address (lowercased)
        pool: address,
        chain: utils.formatChain(PLUME_CHAIN_KEY),
        project: 'nest-credit',
        symbol: v.symbol || 'NEST',
        tvlUsd: Number(v.tvl || 0),
        apyBase: apyBase,
        url: `https://www.nest.credit/vaults/${v.slug}`,
      };

      // Set underlying tokens if available
      if (underlyingTokens.length) {
        pool.underlyingTokens = underlyingTokens;
      }

      if (pusd && !underlyingTokens.includes(pusd)) {
        pool.searchTokenOverride = pusd;
      }

      return pool;
    })
  );

  return pools.filter((p) => p.pool && p.chain && Number.isFinite(p.tvlUsd));
};

module.exports = {
  protocolId: '5284',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://www.nest.credit',
};
