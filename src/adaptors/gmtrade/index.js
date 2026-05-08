const utils = require('../utils');

const POOLS_URL = 'https://market-info-mainnet-prod.gmtrade.xyz/defillama/pools';

const parseNumberOrNaN = (v) => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

const parseUnderlyingTokens = (p) => {
  const longToken = String(p?.long_token ?? '').trim();
  const shortToken = String(p?.short_token ?? '').trim();

  const tokens = [...new Set([longToken, shortToken].filter(Boolean))];
  return tokens.length ? tokens : null;
};

const apy = async () => {
  const data = await utils.getData(POOLS_URL);
  if (!Array.isArray(data)) throw new Error('gmtrade api response is not an array');

  return data
    .map((p) => {
      const chain = utils.formatChain((p.chain ?? 'solana').toString());
      const poolAddress = String(p.pool ?? '').trim();
      if (!poolAddress) return null;

      const underlyingTokens = parseUnderlyingTokens(p);

      return {
        pool: poolAddress,
        chain,
        project: 'gmtrade',
        symbol: p.symbol,
        tvlUsd: parseNumberOrNaN(p.tvl_usd),
        apyBase: parseNumberOrNaN(p.apy_base),
        ...(underlyingTokens ? { underlyingTokens } : {}),
        token: poolAddress,
      };
    })
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://gmtrade.xyz',
};
