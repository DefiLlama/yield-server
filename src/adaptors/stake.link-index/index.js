const utils = require('../utils');

const API_URL = 'https://stake.link/v1/metrics/staking';
const CHAIN_NAME = 'Ethereum';

const pools = [
  {
    symbol: 'ixETH',
    address: '0x535321013A1E2D5aF3B1853812a64CA3fc6C1fa1',
    priceId: 'ethereum',
    query: `SELECT
            (total_rewards * (31536000 / EXTRACT(epoch from period))) / (total_deposits - rewards_amount) * 100 as apy,
            total_deposits
            FROM (SELECT *, (ts - prev_ts) as period
            FROM (SELECT *,
            (rewards_amount - total_fees) as total_rewards,
            lead(ts) over (order by ts DESC)    as prev_ts
            FROM index_update_rewards as rewards
            ORDER BY ts DESC) as reward_rate) as reward_rate limit 1;`,
  },
];

const fetchPrice = async (tokenId) => {
  const priceKey = `coingecko:${tokenId}`;
  const data = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  return data.coins[priceKey].price;
};

const fetchPool = async (pool) => {
  const { symbol, address, priceId, query } = pool;

  const price = await fetchPrice(priceId);

  let data = await utils.getData(API_URL, query);
  let apy = data[0].apy;
  let tvl = data[0].total_deposits * price;

  return {
    pool: `${address}-${CHAIN_NAME}`.toLowerCase(),
    chain: CHAIN_NAME,
    project: 'stake.link-index',
    symbol,
    tvlUsd: tvl,
    apyBase: apy,
  };
};

const fetchPools = async () => {
  return Promise.all(pools.map((pool) => fetchPool(pool)));
};

module.exports = {
  timetravel: false,
  apy: fetchPools,
  url: 'https://stake.link/staking-pools',
};
