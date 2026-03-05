const utils = require('../utils');
const axios = require('axios');

// // Coingecko fallback mapping (kept as backup in case coin_type addresses stop resolving)
// const SUI_COINGECKO = {
//   SUI: 'coingecko:sui', USDC: 'coingecko:usd-coin', USDT: 'coingecko:tether',
//   wUSDC: 'coingecko:usd-coin', wUSDT: 'coingecko:tether',
//   haSUI: 'coingecko:haedal-staked-sui', vSUI: 'coingecko:volo-staked-sui',
//   afSUI: 'coingecko:aftermath-staked-sui', TURBOS: 'coingecko:turbos-finance',
//   WAL: 'coingecko:walrus-2', NS: 'coingecko:ns-protocol',
//   CETUS: 'coingecko:cetus-protocol', DEEP: 'coingecko:deepbook-protocol',
//   WETH: 'coingecko:ethereum', WBTC: 'coingecko:wrapped-bitcoin',
//   SOL: 'coingecko:solana', BUCK: 'coingecko:bucket-protocol',
//   NAVX: 'coingecko:navi-protocol', SCA: 'coingecko:scallop-2',
//   FUD: 'coingecko:fud-the-pug', HIPPO: 'coingecko:sudeng', BLUB: 'coingecko:blub',
// };

const PAGE_SIZE = 100;
const API_URL = 'https://api2.turbos.finance/pools';

const getApy = async () => {
  let pools = [];
  let currentPage = 1;

  while (true) {
    const result = await axios.get(API_URL, {
      params: {
        page: currentPage++,
        pageSize: PAGE_SIZE,
        includeRisk: false,
      },
      headers: { 'Api-Version': 'v2' },
    });
    pools.push(...result.data.result);
    if (result.data.result.length < PAGE_SIZE) break;
  }

  pools = pools.filter((p) => p.apr > 0 && p.liquidity_usd >= 10000);

  return pools.map((p) => ({
    chain: utils.formatChain('sui'),
    project: 'turbos',
    pool: p.pool_id,
    symbol: p.coin_symbol_a + '-' + p.coin_symbol_b,
    tvlUsd: p.liquidity_usd,
    apyBase: p.fee_apr,
    apyBase7d: p.fee_7d_apr,
    volumeUsd1d: p.volume_24h_usd,
    volumeUsd7d: p.volume_7d_usd,
    apyReward: p.reward_apr,
    rewardTokens: p.reward_infos.map((info) => {
      const type = info.vault_coin_type;
      return `sui:${type.startsWith('0x') ? type : '0x' + type}`;
    }),
    poolMeta: `${Number(p.fee) / 10000}%`,
    underlyingTokens: [p.coin_type_a, p.coin_type_b].filter(Boolean),
    url: `https://app.turbos.finance/#/pools/${p.pool_id}/add-liquidity`,
  }));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.turbos.finance/#/pools',
};
