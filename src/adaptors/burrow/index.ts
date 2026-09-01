const axios = require('axios');

async function commonCall(url, method, args = {}) {
  const result = await axios({
    method: 'get',
    url: url + method,
    params: args,
  });
  if (result.data.error) {
    throw new Error(`${result.data.error.message}: ${result.data.error.data}`);
  }
  return result.data;
}

function getBurrowStats() {
  return commonCall('https://api.burrow.finance/get_rewards', '');
}

async function getBurrowFarms() {
  const stats = await getBurrowStats();
  return stats.map((item) => ({
    pool: 'burrow-pool-' + item.token_id,
    chain: 'NEAR',
    project: 'burrow',
    symbol: item.symbol,
    tvlUsd: item.tvl_usd,
    apyReward: item.apy_reward + item.apy_reward_tvl,
    apyBase: item.apy_base,
    underlyingTokens: [item.token_id],
    rewardTokens: item.reward_tokens,
    apyBaseBorrow: item.apy_base_borrow,
    totalSupplyUsd: item.total_supply_usd,
    totalBorrowUsd: item.total_borrow_usd,
    ltv: item.ltv / 1e4,
  }));
}

module.exports = {
  timetravel: false,
  apy: getBurrowFarms,
  url: 'https://app.burrow.cash/deposit/',
};
