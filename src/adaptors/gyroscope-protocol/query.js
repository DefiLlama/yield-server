const BEETHOVEN_API = `
query GetPool($id: String!) {
    pool: poolGetPool(
      id: $id
    ) {
      id
      dynamicData {
        apr {
          swapApr
          nativeRewardApr {
            __typename
            ... on GqlPoolAprRange {
              min
              max
            }
            ... on GqlPoolAprTotal {
              total
            }
          }
          thirdPartyApr {
            __typename
            ... on GqlPoolAprRange {
              min
              max
            }
            ... on GqlPoolAprTotal {
              total
            }
          }
          items {
            id
            title
            __typename
            apr {
              ... on GqlPoolAprRange {
                min
                max
              }
              ... on GqlPoolAprTotal {
                total
              }
            }
            subItems {
              id
              title
              __typename
              apr {
                ... on GqlPoolAprRange {
                  min
                  max
                }
                ... on GqlPoolAprTotal {
                  total
                }
              }
            }
          }
        }
      }
    }
  }
  `;

module.exports = BEETHOVEN_API;
