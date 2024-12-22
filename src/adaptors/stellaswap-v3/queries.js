const { gql } = require('graphql-request');

const _50 = 50 // fetch first 50 records
const aprDelta = 259200;
const blockDelta = 60;
const previousDate = Math.floor(Date.now() / 1000) - aprDelta;

exports.queryPools = gql
    `{
        pools(first: ${_50}, orderBy: totalValueLockedUSD, orderDirection: desc) {
        id
        poolDayData(first: 1000, orderBy: date, orderDirection: desc) {
            tvlUSD
            volumeUSD
            untrackedVolumeUSD
            date
        }
        volumeUSD
        token0 {
            id
            symbol
            decimals
        }
        token1 {
            id
            symbol
            decimals
        }
        totalValueLockedToken0
        totalValueLockedToken1
        totalValueLockedUSD
        feesUSD
        feesToken0
        feesToken1
        token0Price
        token1Price
        tick
        liquidity
        }
    }`

exports.queryPrior = gql
    `{
        pools(first: ${_50}, block: { number: <PREV_BLOCK_NUMBER> }, orderBy: id) {
            feesToken0
            feesToken1
            id
            token0 {
                name
                decimals
            }
            token1 {
                name
                decimals
            }
            token0Price
            tick
            liquidity
        }
    }`

exports.queryBlock = gql
    `{
        blocks(
            first: 1
            orderBy: timestamp
            orderDirection: desc
            where: { timestamp_lt: ${previousDate}, timestamp_gt: ${previousDate - blockDelta} }
        ) {
            number
        }
    }`

exports.queryPositions = gql
    `{
        positions(first: 1000, where: { liquidity_gt: 0, pool: "<POOL_ID>" }) {
          id
        owner
        tickLower{
            tickIdx
        }
        tickUpper{
            tickIdx
        }
        liquidity
        depositedToken0
        depositedToken1
        token0{
          decimals
        }
        token1{
          decimals
        }
        pool{
          id
          token0Price
          tick
          token0{
            name
            decimals
            derivedMatic
          }
          token1{
            name
            decimals
            derivedMatic
          }
        }
      }
    }`;

exports.queryFarming = gql
    `{
        eternalFarmings{
            id
            rewardToken
            bonusRewardToken
            rewardRate
            bonusRewardRate
            pool
        }
    }`

exports.queryDeposits = gql
    `{
        deposits(first: ${_50}, where: {eternalFarming: "<FARMING_ID>"}){
          id
        }
    }`

exports.queryTokens = gql
    `{
       tokens(where: {id: "<TOKEN_ADDRESS>"}){
        derivedMatic
        decimals
      }
    }`

exports.queryPositionsViaIds = gql
    `{
        positions(first: ${_50}, where: {id_in: <TOKEN_IDS>}){
          id
          liquidity
          tickLower{
            tickIdx
          }
          tickUpper{
            tickIdx
          }
          pool{
            token0{
              name
              decimals
              derivedMatic
            }
            token1{
              name
              decimals
              derivedMatic
            }
            tick
          }
        }
    }`