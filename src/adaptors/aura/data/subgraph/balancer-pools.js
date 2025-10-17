const axios = require('axios');
const { BALANCER_API_ENDPOINT } = require('../../constants');

/**
 * Get pool data from Balancer V3 API
 */
async function getBalancerPoolsData(poolIdentifiers, balancerChainName) {
  if (!balancerChainName) return {};

  const query = `
    query Pools($chains: [GqlChain!]!, $ids: [String!] ) {
      poolGetPools(
        where: { chainIn: $chains, idIn: $ids }
        first: 1000
      ) {
        id
        address
        poolTokens {
          address
          underlyingToken {
            address
          }
          useUnderlyingForAddRemove
        }
        dynamicData {
          aprItems {
            apr
            type
          }
        }
      }
    }
  `;

  try {
    const data = await axios
      .post(BALANCER_API_ENDPOINT, {
        query,
        variables: { chains: [balancerChainName], ids: poolIdentifiers },
      })
      .then((res) => res.data.data.poolGetPools);

    return data.reduce((acc, pool) => {
      if (pool.id) acc[pool.id.toLowerCase()] = pool;
      if (pool.address) acc[pool.address.toLowerCase()] = pool;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

module.exports = {
  getBalancerPoolsData,
};
