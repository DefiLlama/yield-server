const axios = require('axios');

const API_URL = 'https://api-mainnet-prod.minswap.org/defillama/yield-server';

// Cardano token symbol → coingecko ID mapping
const CARDANO_COINGECKO = {
  ADA: 'coingecko:cardano',
  MIN: 'coingecko:minswap',
  SNEK: 'coingecko:snek',
  DJED: 'coingecko:djed',
  iUSD: 'coingecko:iusd',
  IUSD: 'coingecko:iusd',
  HOSKY: 'coingecko:hosky',
  WMT: 'coingecko:world-mobile-token',
  WMTX: 'coingecko:world-mobile-token',
  IAG: 'coingecko:iagon',
  NTX: 'coingecko:nunet',
  INDY: 'coingecko:indigo-dao-governance-token',
  AGIX: 'coingecko:singularitynet',
  FET: 'coingecko:fetch-ai',
  COPI: 'coingecko:cornucopias',
  LENFI: 'coingecko:aada-finance',
  LQ: 'coingecko:liqwid-finance',
  PAVIA: 'coingecko:pavia',
  VYFI: 'coingecko:vyfinance',
  JPG: 'coingecko:jpg-store',
  ONT: 'coingecko:ontology',
  NIGHT: 'coingecko:midnight-3',
  USDM: 'coingecko:usdm-2',
  USDA: 'coingecko:anzens-usda',
};

const resolveUnderlyingTokens = (symbol, apiTokens) => {
  // Use API-provided tokens if available and non-empty
  if (apiTokens && apiTokens.length > 0) return apiTokens;

  // Parse symbol to extract token pair (e.g. "ADA-MIN" → ["ADA", "MIN"])
  if (!symbol) return undefined;
  const parts = symbol.split('-').map((s) => s.trim());
  const resolved = parts
    .map((p) => CARDANO_COINGECKO[p])
    .filter(Boolean);

  return resolved.length > 0 ? resolved : undefined;
};

const apy = async () => {
  const data = (await axios.get(API_URL)).data;
  return data.map((d) => {
    const underlyingTokens = resolveUnderlyingTokens(d.symbol, d.underlyingTokens);
    return {
      pool: `${d.pool}-cardano`,
      chain: "Cardano",
      project: 'minswap-dex',
      symbol: d.symbol,
      tvlUsd: d.tvlUsd,
      apyBase: d.apyBase,
      apyReward: d.apyReward,
      ...(underlyingTokens && { underlyingTokens }),
      rewardTokens: d.rewardTokens,
      poolMeta: d.poolMeta
    };
  });
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.minswap.org/farm',
};
