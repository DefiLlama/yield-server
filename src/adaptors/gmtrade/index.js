const utils = require('../utils');

const POOLS_URL = 'https://market-info-mainnet-prod.gmtrade.xyz/defillama/pools';

const parseNumberOrNaN = (v) => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

const apy = async () => {
  const data = await utils.getData(POOLS_URL);
  if (!Array.isArray(data)) throw new Error('gmtrade api response is not an array');

  return data
    .map((p) => {
      const chain = utils.formatChain((p.chain ?? 'solana').toString());
      const poolAddress = String(p.pool ?? '').trim();
      if (!poolAddress) return null;

      return {
        pool: poolAddress,
        chain,
        project: 'gmtrade',
        symbol: p.symbol,
        tvlUsd: parseNumberOrNaN(p.tvl_usd),
        apyBase: parseNumberOrNaN(p.apy_base),
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
