const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'sonic';
const PROJECT = 'metropolis-dlmm';
const POOLS_API =
  'https://api-b.metropolis.exchange/api/v1/pools?chainId=146';

async function apy() {
  const { data: pools } = await axios.get(POOLS_API);

  return pools
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
