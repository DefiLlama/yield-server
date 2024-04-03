const utils = require('../utils');
const axios = require('axios');

const PAGE_SIZE = 100;
const API_URL = 'https://api.turbos.finance/pools/v2';

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
    pools.push(...result.data.list);
    if (result.data.list.length < PAGE_SIZE) break;
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
      // Get token symbol
      return info.fields.vault_coin_type.split('::').pop();
    }),
    poolMeta: `${Number(p.fee) / 10000}%`,
    underlyingTokens: [p.coin_symbol_a, p.coin_symbol_b],
    url: `https://app.turbos.finance/#/pools/${p.pool_id}/add-liquidity`,
  }));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.turbos.finance/#/pools',
};
