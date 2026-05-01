const utils = require('../utils');

const POOLS_URL = 'https://market-info-mainnet-prod.gmtrade.xyz/defillama/pools';

const apy = async () => {
  const data = await utils.getData(POOLS_URL);
  if (!Array.isArray(data)) throw new Error('gmtrade api response is not an array');

  return data
    .map((p) => {
      const chain = utils.formatChain((p.chain ?? 'solana').toString());
      const poolAddress = p.pool;
      if (!poolAddress) return null;

      const pool = poolAddress.toLowerCase();

      return {
        pool,
        chain,
        project: 'gmtrade',
        symbol: p.symbol,
        tvlUsd: Number(p.tvl_usd),
        apyBase: Number(p.apy_base),
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
