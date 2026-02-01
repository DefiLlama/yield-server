const utils = require('../utils');

const API_URL = 'https://neuraapi-production.up.railway.app/api/neura-vault/vaults';
const CHAIN = 'hyperliquid';

const poolsFunction = async () => {
  const response = await utils.getData(API_URL);

  if (!response.success || !response.data) {
    console.error('No vault data returned from API');
    return [];
  }

  const vaults = response.data;

  // Get prices for all underlying tokens
  const underlyingAddresses = vaults.map((v) => v.underlying);
  const prices = (
    await utils.getPrices(underlyingAddresses, CHAIN)
  ).pricesByAddress;

  const pools = vaults.map((vault) => {
    const decimals = vault.underlyingDecimals || 6;
    const totalAssets = Number(vault.currentData?.totalAssets || 0) / 10 ** decimals;
    const price = prices[vault.underlying.toLowerCase()] || 0;
    const tvlUsd = totalAssets * price;

    // APY from API (already in percentage format)
    const apyBase = vault.apy?.apy || 0;
    const apyBase7d = vault.apy?.apy7d || null;

    return {
      pool: `${vault.address}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'neura-vaults',
      symbol: utils.formatSymbol(vault.underlyingSymbol || vault.symbol),
      tvlUsd,
      apyBase,
      apyBase7d,
      underlyingTokens: [vault.underlying],
      poolMeta: 'AI-Powered Yield Optimization',
      url: `https://neuravaults.xyz/vaults/${vault.address}`,
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://neuravaults.xyz/',
};
