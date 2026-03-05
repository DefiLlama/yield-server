const { request, gql } = require('graphql-request');

const BEX_API_URL = 'https://api.berachain.com';
const BEX_URL = 'https://hub.berachain.com';
const CHAIN = 'Berachain';
const PROJECT = 'bex';
const BGT_ADDRESS = '0x656b95E550C07a9ffe548bd4085c72418Ceb1dba';

async function getPoolData() {
  const allPools = await getPools();

  const filteredPools = await filterPools(allPools);

  const pools = [];
  for (const pool of filteredPools.poolGetPools) {
    const poolData = {
      pool: `${pool.address}-${CHAIN}`,
      chain: CHAIN,
      project: PROJECT,
      symbol: pool.name.replace(' | ', '-'),
      tvlUsd: Number(pool.dynamicData.totalLiquidity),
      apyBase: pool.dynamicData.aprItems[0]?.apr
        ? Number(pool.dynamicData.aprItems[0].apr) * 100
        : null,
      apyReward: Number(pool.rewardVault?.dynamicData.apr) * 100,
      rewardTokens: [BGT_ADDRESS],
      underlyingTokens: [
        pool.address,
        ...pool.displayTokens.map((token) => token.address),
      ],
      url: `${BEX_URL}/pools/${pool.id}/details/`,
      poolMeta: pool.symbol.split('-').pop() || '',
    };
    pools.push(poolData);
  }
  return pools;
}

async function filterPools(pools) {
  // const poolMustHaveApr = (pool) => pool.dynamicData.aprItems.length > 0;
  const poolMustHaveRewardVault = (pool) => pool.rewardVault !== null;

  return {
    poolGetPools: pools.poolGetPools
      // .filter(poolMustHaveApr)
      .filter(poolMustHaveRewardVault),
  };
}

async function getPools() {
  const query = gql`
    query GetPoolData {
      poolGetPools(
        orderBy: totalLiquidity
        orderDirection: desc
        where: { minTvl: 10000 }
      ) {
        id
        address
        chain
        name
        symbol
        chain
        displayTokens {
          address
        }
        rewardVault {
          dynamicData {
            apr
          }
        }
        dynamicData {
          aprItems {
            apr
          }
          totalLiquidity
        }
      }
    }
  `;
  return await request(BEX_API_URL, query);
}

module.exports = {
  timetravel: false,
  apy: getPoolData,
  url: 'https://hub.berachain.com/pools/',
};
