const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'sonic';
const PROJECT = 'metropolis-dlmm';
const POOLS_API =
  'https://api-b.metropolis.exchange/api/v1/pools?chainId=146';

// Spam/test pools with fake TVL from worthless tokens
const EXCLUDED_POOLS = new Set([
  '0x1231285bf06d53f768103ffbeeb25f98a493aec4', // MTK-wS (fake $302M TVL)
  '0xf26ad6fd42e383180823d39c7a4fa396e722ba42', // Test-wS
  '0x84a44770b0515484775b32aa7b690f26e4e9152e', // OIL-wS (spam token)
  '0x032bedfcf082d1fd260bb96aeec8492ab7c083be', // OIL-wS (spam token, same deployer)
  '0x28c3513d50f84ec97c612adfe1566e3541c400ac', // WIND-wS (dead meme, zero activity)
  '0x005ec0532606f6552c852132d6d5a1496a627137', // 619-wS (spam proxy clone)
]);

async function apy() {
  const { data: pools } = await axios.get(POOLS_API);

  return pools
    .filter((pool) => !EXCLUDED_POOLS.has(pool.address.toLowerCase()))
    .map((pool) => ({
      pool: `${pool.address}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: `${pool.tokenX.symbol}-${pool.tokenY.symbol}`,
      tvlUsd: pool.liquidityUSD,
      apyBase: pool.feeApr24,
      apyBase7d: pool.feeApr7d,
      underlyingTokens: [pool.tokenX.address, pool.tokenY.address],
      poolMeta: `${pool.binStep} binStep`,
      volumeUsd1d: pool.volumeUSD,
      volumeUsd7d: pool.volumeUSDWeek,
      url: `https://app.metropolis.exchange/liquidity/manual/:146/add/v21/${pool.address}/${pool.binStep}?showTop=true`,
    }))
    .filter((p) => utils.keepFinite(p));
}

module.exports = {
  timetravel: false,
  apy,
};
