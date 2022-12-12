const { gql } = require('graphql-request');

const query = gql`
  query ($days: Int!, $mexID: String!, $offset: Int, $pairsLimit: Int) {
    totalAggregatedRewards(days: $days)
    farms {
      ... on FarmModelV1_3 {
        __typename
        address
        farmedToken {
          balance
          decimals
          name
          identifier
          ticker
          owner
          assets {
            website
            description
            status
            pngUrl
            svgUrl
            __typename
          }
          price
          type
          __typename
        }
        farmedTokenPriceUSD
        farmToken {
          decimals
          name
          collection
          ticker
          __typename
        }
        farmTokenPriceUSD
        farmTokenSupply
        farmingToken {
          balance
          decimals
          name
          identifier
          ticker
          owner
          assets {
            website
            description
            status
            pngUrl
            svgUrl
            __typename
          }
          price
          type
          __typename
        }
        farmingTokenPriceUSD
        perBlockRewards
        totalValueLockedUSD
        produceRewardsEnabled
        apr
        __typename
      }
    }
    pairs(offset: $offset, limit: $pairsLimit) {
      address
      firstToken {
        balance
        decimals
        name
        identifier
        ticker
        owner
        assets {
          website
          description
          status
          pngUrl
          svgUrl
          __typename
        }
        price
        type
        __typename
      }
      firstTokenPrice
      firstTokenPriceUSD
      firstTokenVolume24h
      firstTokenLockedValueUSD
      secondToken {
        balance
        decimals
        name
        identifier
        ticker
        owner
        assets {
          website
          description
          status
          pngUrl
          svgUrl
          __typename
        }
        price
        type
        __typename
      }
      secondTokenPrice
      secondTokenPriceUSD
      secondTokenVolume24h
      secondTokenLockedValueUSD
      liquidityPoolToken {
        balance
        decimals
        name
        identifier
        ticker
        owner
        assets {
          website
          description
          status
          pngUrl
          svgUrl
          __typename
        }
        price
        type
        __typename
      }
      state
      type
      lockedValueUSD
      info {
        reserves0
        reserves1
        totalSupply
        __typename
      }
      feesAPR
      feesUSD24h
      volumeUSD24h
      totalFeePercent
      specialFeePercent
      lockedTokensInfo {
        lockingScAddress
        unlockEpoch
        __typename
      }
      __typename
    }
    stakingFarms {
      address
      rewardToken {
        balance
        decimals
        name
        identifier
        ticker
        owner
        assets {
          website
          description
          status
          pngUrl
          svgUrl
          __typename
        }
        price
        type
        __typename
      }
      farmToken {
        decimals
        name
        collection
        ticker
        __typename
      }
      farmingToken {
        balance
        decimals
        name
        identifier
        ticker
        owner
        assets {
          website
          description
          status
          pngUrl
          svgUrl
          __typename
        }
        price
        type
        __typename
      }
      state
      minUnboundEpochs
      annualPercentageRewards
      rewardPerShare
      farmTokenSupply
      perBlockRewards
      __typename
    }
    factory {
      address
      commonTokensForUserPairs
      enableSwapByUserConfig {
        lockedTokenID
        minLockPeriodEpochs
        minLockedTokenValue
        __typename
      }
      maintenance
      pairCount
      totalFeesUSD24h
      totalTxCount
      totalValueLockedUSD
      totalVolumeUSD24h
      __typename
    }
    priceDiscoveryContracts {
      address
      lockingScAddress
      acceptedToken {
        balance
        decimals
        name
        identifier
        ticker
        owner
        assets {
          website
          description
          status
          pngUrl
          svgUrl
          __typename
        }
        price
        type
        __typename
      }
      acceptedTokenAmount
      acceptedTokenPrice
      acceptedTokenPriceUSD
      acceptedTokenRedeemBalance
      launchedToken {
        balance
        decimals
        name
        identifier
        ticker
        owner
        assets {
          website
          description
          status
          pngUrl
          svgUrl
          __typename
        }
        price
        type
        __typename
      }
      launchedTokenAmount
      launchedTokenPrice
      launchedTokenPriceUSD
      launchedTokenRedeemBalance
      redeemToken {
        decimals
        name
        collection
        ticker
        __typename
      }
      currentPhase {
        name
        penaltyPercent
        __typename
      }
      startBlock
      endBlock
      unlockEpoch
      noLimitPhaseDurationBlocks
      fixedPenaltyPhaseDurationBlocks
      linearPenaltyPhaseDurationBlocks
      minLaunchedTokenPrice
      fixedPenaltyPercentage
      penaltyMaxPercentage
      penaltyMinPercentage
      __typename
    }
    getFeeTokenBurned(time: "365d", tokenID: $mexID)
    getPenaltyTokenBurned(time: "365d", tokenID: $mexID)
  }
`;

module.exports = {
  query,
};
