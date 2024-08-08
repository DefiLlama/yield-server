const { gql } = require('graphql-request');

const getStrykeVaultListQuery = gql`
  query getStrykeVaultList {
    dopexVaults(orderBy: totalSupply, orderDirection: desc) {
      id
      totalAssets
      totalSupply
      decimals
      yieldStart
      isTokenPairReversed
      depositCap
      pool
    }
  }
`

const getUniV3PoolListQuery = gql`
  query getUniV3PoolListQuery($poolIds: [ID!]!) {
    pools(where: { id_in: $poolIds }) {
      id
      tick
      sqrtPrice
      token0 {
        id
        name
        symbol
        decimals
        derivedETH
      }
      token1 {
        id
        name
        symbol
        decimals
        derivedETH
      }
      token0Price
      token1Price
    }
    bundle(id: "1") {
      ethPriceUSD
      id
    }
  }
`

const getStrykeLpPositionsListQuery = gql`
  query getStrykeLpPositionsList($vaultIds: [String!]!) {
    lppositions(where: { user_in: $vaultIds, shares_gt: "0" }) {
      id
      pool
      shares
      initialLiquidity
      user
      handler
      strike {
        id
        pool
        tickLower
        tickUpper
        totalLiquidity
        usedLiquidity
        totalShares
      }
    }
  }
`

const getDailyStrikeEarningsListQuery = gql`
  query getDailyStrikeEarningsListQuery(
    $tokenIds: [ID!]!
    $tokenIdsCount: Int!
    $startTime: BigInt!
  ) {
    dailyDonations(
      where: { strike_: { id_in: $tokenIds }, donation_gt: "0", start_gte: $startTime }
      orderBy: start
      orderDirection: desc
      first: $tokenIdsCount
    ) {
      id
      donation
      sqrtPriceX96
      start
      strike {
        id
      }
    }
    dailyFeeCompounds(
      where: { strike_: { id_in: $tokenIds }, compound_gt: "0", start_gte: $startTime }
      orderBy: start
      orderDirection: desc
      first: $tokenIdsCount
    ) {
      id
      compound
      sqrtPriceX96
      start
      strike {
        id
      }
    }
  }
`

module.exports = { getStrykeVaultListQuery, getUniV3PoolListQuery, getStrykeLpPositionsListQuery, getDailyStrikeEarningsListQuery}