const { gql } = require('graphql-request');

 const findToken = gql`
  query findToken($address: String!) {
    token(id: $address) {
      derivedEth
      decimals
    }
  }
`;

 const getPositionsByIds = gql`
  query getPositionsByIds($id_in: [ID!], $first: Int, $skip: Int) {
    positions(where: { id_in: $id_in }, first: $first, skip: $skip) {
      id
      liquidity
      tickLower {
        tickIdx
      }
      tickUpper {
        tickIdx
      }
      pool {
        token0 {
          name
          decimals
          derivedEth
        }
        token1 {
          name
          decimals
          derivedEth
        }
        tick
      }
    }
  }
`;

 const getPositionsByPoolId = gql`
  query getPositionsByPoolId($pool: String!) {
    poolPositions(where: { pool: $pool }) {
      lowerTick {
        tickIdx
      }
      upperTick {
        tickIdx
      }
      liquidity
      pool {
        id
        token0Price
      }
    }
  }
`;

 const getPoolsByBlockNumber = gql`
  query getPoolsByBlockNumber($blockNumber: Int!) {
    pools(block: { number: $blockNumber }, first: 1000, orderBy: id) {
      feesToken0
      feesToken1
      liquidity
      id
      token0 {
        decimals
        name
      }
      token1 {
        decimals
        name
      }
      token0Price
      tick
    }
  }
`;

 const getPools = gql`
  query getPools {
    pools(first: 1000, orderBy: id) {
      feesToken0
      feesToken1
      liquidity
      plugin
      id
      token0 {
        decimals
        name
        symbol
      }
      token1 {
        decimals
        name
        symbol
      }
      token0Price
      tick
      totalValueLockedUSD
    }
  }
`;

 const findEternalFarmingInfos = gql`
  query findEternalFarmingInfos {
    eternalFarmings {
      id
      pool
      rewardToken
      bonusRewardToken
      rewardRate
      bonusRewardRate
    }
  }
`;

 const getPositionsInEternalFarming = gql`
  query getPositionsInEternalFarming(
    $eternalFarming: String!
    $first: Int
    $skip: Int
  ) {
    deposits(
      where: { eternalFarming: $eternalFarming }
      first: $first
      skip: $skip
    ) {
      id
    }
  }
`;

 const getPreviousBlockNumber = gql`
  query getPreviousBlockNumber($timestampLt: BigInt!, $timestampGt: BigInt!) {
    blocks(
      first: 1
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lt: $timestampLt, timestamp_gt: $timestampGt }
    ) {
      number
    }
  }
`;

module.exports = {
    findToken,
    getPositionsByIds,
    getPositionsByPoolId,
    getPoolsByBlockNumber,
    getPools,
    findEternalFarmingInfos,
    getPositionsInEternalFarming,
    getPreviousBlockNumber
}