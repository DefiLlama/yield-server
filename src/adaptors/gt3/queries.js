// GraphQL queries for GT3 Finance API

/**
 * Query to get project configuration including tokens, pools, addresses, and gauges
 */
const PROJECT_CONFIG_QUERY = {
  operationName: "GET_PROJECT_CONFIG_QUERY",
  variables: {},
  query: `query GET_PROJECT_CONFIG_QUERY {
    getProjectConfiguration {
      __typename
      ... on ProjectConfig {
        id
        key
        chainID
        tokens {
          id
          name
          symbol
          decimals
          type
          metadata {
            permitted
            domainName
            domainVersion
            swapFeeType
            __typename
          }
          __typename
        }
        pools {
          id
          name
          symbol
          decimals
          type
          tokens
          multiplier
          metadata {
            permitted
            domainName
            domainVersion
            swapFeeType
            __typename
          }
          __typename
        }
        addresses {
          tokenID
          address
          feed
          __typename
        }
        externalSources {
          uri
          purposes
          __typename
        }
        balances
        dexRouters {
          id
          address
          type
          __typename
        }
        synthetics {
          id
          escrowedTokenId
          type
          vaultAddress
          voterAddress
          rebaseAddress
          epochDuration
          minLockDuration
          maxLockDuration
          minterAddress
          __typename
        }
        gauges {
          poolID
          address
          rewardTokenID
          __typename
        }
        bribes {
          poolID
          address
          __typename
        }
        __typename
      }
      ... on SimpleError {
        description
        __typename
      }
    }
  }`
};

/**
 * Query to get pool statistics with pagination
 * @param {number} offset - Pagination offset
 * @param {number} limit - Number of items per page
 * @returns {Object} GraphQL query object
 */
const createPoolStatsQuery = (offset = 0, limit = 100) => ({
  operationName: "GET_POOL_STATS_QUERY",
  variables: {
    input: {
      items: [],
      paginationMetadata: {
        offset,
        limit,
        orderBy: "id",
        orderDirection: "DESC"
      }
    }
  },
  query: `query GET_POOL_STATS_QUERY($input: GetPoolStatsInput!) {
    getPoolStats(input: $input) {
      __typename
      ... on PoolStatsPaginatedListInfo {
        items {
          id
          address
          shareTokenID
          shareTokenSupply {
            number
            bigint
            tokenID
            currencyAmounts {
              number
              currencyID
              __typename
            }
            __typename
          }
          reserves {
            number
            bigint
            tokenID
            currencyAmounts {
              number
              currencyID
              __typename
            }
            __typename
          }
          apr
          estimatedApr
          __typename
        }
        metadata {
          offset
          limit
          orderBy
          orderDirection
          numElements
          __typename
        }
        __typename
      }
      ... on SimpleError {
        description
        __typename
      }
    }
  }`
});

module.exports = {
  PROJECT_CONFIG_QUERY,
  createPoolStatsQuery
}; 