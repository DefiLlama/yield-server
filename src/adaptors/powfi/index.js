const utils = require('../utils');

const POOL_API = 'https://api.powfi.alephium.org/pools';
const APP_URL = 'https://powfi.alephium.org';

// The Alephium token list suffixes bridged assets with their origin chain
// (USDTeth, USDCeth, USDTbsc, ...). Use the on-chain symbol instead so pools
// show up as USDT/USDC in DefiLlama searches; the origin goes in poolMeta.
const tokenSymbol = (token) => token.symbolOnChain || token.symbol;

const bridgeOrigin = (token) =>
  token.originChain ? `${tokenSymbol(token)} via AlphBridge (${token.originChain})` : null;

async function getPools() {
  const pools = [];
  for (let page = 1, totalPages = 1; page <= totalPages; page++) {
    const { data } = await utils.getData(`${POOL_API}?page=${page}&pageSize=300`);
    pools.push(...data.data);
    totalPages = data.meta.totalPages;
  }
  return pools;
}

const apy = async () => {
  const pools = await getPools();

  return pools
    .map((pool) => {
      const { token0Info: token0, token1Info: token1, day, week } = pool;
      const origins = [token0, token1].map(bridgeOrigin).filter(Boolean);
      const fee = `${+(Number(pool.feeRate) * 100).toFixed(4)}%`;

      return {
        pool: `${pool.poolId}-alephium`,
        chain: utils.formatChain('alephium'),
        project: 'powfi',
        symbol: `${tokenSymbol(token0)}-${tokenSymbol(token1)}`,
        tvlUsd: Number(pool.tvl),
        apyBase: Number(day.feeApr),
        apyBase7d: Number(week.feeApr),
        underlyingTokens: [token0.id, token1.id],
        poolMeta: [pool.type === 'concentrated' ? 'CLMM' : 'CPMM', fee, ...origins].join(', '),
        volumeUsd1d: Number(day.volumeUsd),
        volumeUsd7d: Number(week.volumeUsd),
        url: `${APP_URL}/pools?pool=${pool.poolId}`,
      };
    })
    .filter((p) => p.tvlUsd > 0)
    .filter(utils.keepFinite);
};

module.exports = {
  protocolId: '8744',
  timetravel: false,
  apy,
  url: APP_URL,
};
