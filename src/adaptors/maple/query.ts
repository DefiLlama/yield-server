const { gql } = require('graphql-request');

module.exports = {
  query: gql`
    query AllPoolsQuery($filter: Filter) {
      results: allPools(filter: $filter) {
        list {
          ...PoolFields
          __typename
        }
        total
        __typename
      }
    }

    fragment PoolFields on Pool {
      _id
      hidden
      allowedLPs
      allowedSLs
      balance
      contractAddress
      currentLoaned
      defaultsTotal
      delegateFee
      farmingApy
      lendingApy
      liquidity
      liquidityAsset {
        ...AssetFields
        __typename
      }
      liquidityAssetRecoveredTotal
      liquidityCap
      liquidityLocker
      lockupPeriod
      lpApy
      mplRewards {
        ...RewardFields
        __typename
      }
      name
      numActiveLoans
      numPositions
      openToPublic
      ongoingFee
      poolDelegate {
        ...PoolDelegateFields
        __typename
      }
      poolDelegateFees
      poolName
      poolPositions {
        ...PoolPositionFields
        __typename
      }
      poolTokenTotalSupply
      stake
      stakeAsset {
        ...AssetFields
        __typename
      }
      stakeLocker
      stakeLockerFees
      stakeLockerLiquidity
      stakeLockerOpenToPublic
      stakeLockupPeriod
      stakeRewards {
        ...RewardFields
        __typename
      }
      stakeRewardsApy
      stakingApy
      stakingFee
      state
      strategy
      symbol
      totalFees
      totalInterestEarned
      totalLoaned
      totalLoanOriginations
      totalPoolTokensStaked
      totalPrincipalRepaid
      totalStakeLockerTokensStaked
      transactionHash
      transaction {
        ...TransactionFields
        __typename
      }
      txCount
      __typename
    }

    fragment AssetFields on Asset {
      address
      symbol
      decimals
      price
      __typename
    }

    fragment PoolDelegateFields on PoolDelegate {
      _id
      name
      website
      twitter
      aboutBusiness
      companyName
      owner
      allowList
      telegram
      linkedIn
      deckFileUrl
      __typename
    }

    fragment RewardFields on MplRewards {
      id
      periodFinish
      reward
      rewardRate
      rewardsDuration
      paused
      __typename
    }

    fragment PoolPositionFields on PoolPosition {
      id
      poolTokenBalance
      poolTokensStaked
      claimableInterest
      interestEarned
      rewardPaid
      custodyAllowance
      depositDate
      withdrawCooldown
      recognizableLendingLosses
      recognizedLendingLosses
      withdrawStatus
      stake
      stakeLockerTokensStaked
      claimableFees
      feesEarned
      stakeRewardPaid
      stakeCustodyAllowance
      stakeDate
      unstakeCooldown
      recognizableCoverLosses
      recognizedCoverLosses
      __typename
    }

    fragment TransactionFields on Transaction {
      id
      timestamp
      __typename
    }
  `,
};
