const utils = require('../utils');

const TAPP_EXCHANGE_API_URL = 'https://api.tapp.exchange/api/v1';
const randomId = Math.floor(Math.random() * 1000000);

async function main() {
  const pools = await utils.getData(`${TAPP_EXCHANGE_API_URL}`, {
    method: 'public/pool',
    jsonrpc: '2.0',
    id: randomId,
    params: {
      query: {
        page: 1,
        pageSize: 100,
        interval: '7d',
        sortBy: 'tvl',
        sortOrder: 'desc',
      },
    },
  });

  const poolsData = pools.result.data;

  //   filter only showing tvl > 10k
  const filteredPools = poolsData.filter((pool) => Number(pool.tvl) > 10000);

  const tvlArr = [];

  for (const pool of filteredPools) {
    const tokenPairs = pool.tokens.map((token) => token.symbol);
    tvlArr.push({
      pool: `${pool.poolId}::${pool.poolType}::${tokenPairs.join('-')}`,
      chain: utils.formatChain('aptos'),
      project: 'tapp-exchange',
      apyBase: pool.apr.feeAprPercentage,
      apyReward: pool.apr.boostedAprPercentage,
      rewardTokens: pool.apr.campaignAprs.map(
        (campaign) => campaign.token.addr
      ),
      symbol: tokenPairs.join('-'),
      tvlUsd: Number(pool.tvl),
      underlyingTokens: pool.tokens.map((token) => token.addr),
      url: `https://tapp.exchange/pool/${pool.poolId}`,
    });
  }

  return tvlArr;
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://tapp.exchange',
};
