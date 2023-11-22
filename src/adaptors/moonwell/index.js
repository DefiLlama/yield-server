const utils = require('../utils')
const sdk = require('@defillama/sdk4')
const { request, gql, batchRequests } = require('graphql-request')
const { MRD_ABI } = require('./abi')
const axios = require('axios')

const MRD_CONTRACT = '0xe9005b078701e2A0948D2EaC43010D35870Ad9d2'

const getPrices = async addresses => {
  const prices = (
    await axios.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
  ).data.coins

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: {
        decimals: price.decimals,
        symbol: price.symbol,
        price: price.price
      }
    }),
    {}
  )

  return pricesByAddress
}

const multicallMRD = async markets => {
  return (
    await sdk.api.abi.multiCall({
      chain: 'base',
      calls: markets.map(market => ({
        target: MRD_CONTRACT,
        params: [market]
      })),
      abi: MRD_ABI.find(({ name }) => name === 'getAllMarketConfigs')
    })
  ).output.map(({ output }) => output)
}

const API_URL =
  'https://api.thegraph.com/subgraphs/name/moonwell-fi/moonwell-moonbeam'
const query = gql`
  {
    markets {
      id
      borrowRate
      supplyRate
      totalBorrows
      totalSupply
      underlyingSymbol
      underlyingPriceUSD
      exchangeRate
      underlyingAddress
      collateralFactor
      supplyRewardNative
      supplyRewardProtocol
      borrowRewardNative
      borrowRewardProtocol
    }
  }
`

const BASE_API_URL =
  'https://subgraph.satsuma-prod.com/dd48bfe50148/moonwell/base/api'
const base_query = gql`
  {
    markets {
      id
      borrowRate
      supplyRate
      totalBorrows
      totalSupply
      underlyingSymbol
      underlyingPriceUSD
      exchangeRate
      underlyingAddress
      collateralFactor
    }
  }
`
const getApy = async () => {
  const res = await request(API_URL, query)
  const moonbeamResults = res.markets
    .map(pool => {
      let price =
        pool.underlyingSymbol.toLowerCase() === 'usdc'
          ? 1
          : Number(pool.underlyingPriceUSD)
      if (price === 0 && pool.underlyingSymbol.toLowerCase() === 'weth') {
        const _price = res.markets.find(
          e => e.id === '0xaaa20c5a584a9fecdfedd71e46da7858b774a9ce'
        ).underlyingPriceUSD
        price = Number(_price)
      }

      const totalSupplyUsd =
        Number(pool.totalSupply) * Number(pool.exchangeRate) * price
      const totalBorrowUsd = Number(pool.totalBorrows) * price

      return {
        pool: pool.id.toLowerCase(),
        chain: utils.formatChain('moonbeam'),
        project: 'moonwell',
        symbol: pool.underlyingSymbol,
        tvlUsd: totalSupplyUsd - totalBorrowUsd,
        apyBase: Number(pool.supplyRate),
        apyReward:
          Number(pool.supplyRewardNative) + Number(pool.supplyRewardProtocol),
        underlyingTokens: [
          pool.underlyingAddress ===
          '0x0000000000000000000000000000000000000000'
            ? '0xAcc15dC74880C9944775448304B263D191c6077F'
            : pool.underlyingAddress
        ],
        rewardTokens: [
          '0x511ab53f793683763e5a8829738301368a2411e3',
          '0xacc15dc74880c9944775448304b263d191c6077f'
        ],
        // borrow fields
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(pool.borrowRate),
        apyRewardBorrow:
          Number(pool.borrowRewardNative) + Number(pool.borrowRewardProtocol),
        ltv: Number(pool.collateralFactor)
      }
    })
    .filter(e => e.ltv)

  let base_res = await request(BASE_API_URL, base_query)
  let baseResults = base_res.markets
    .map(pool => {
      let price =
        pool.underlyingSymbol.toLowerCase() === 'usdc'
          ? 1
          : Number(pool.underlyingPriceUSD)

      const totalSupplyUsd =
        Number(pool.totalSupply) * Number(pool.exchangeRate) * price

      const totalBorrowUsd = Number(pool.totalBorrows) * price
      return {
        pool: pool.id.toLowerCase(),
        chain: utils.formatChain('base'),
        project: 'moonwell',
        symbol: pool.underlyingSymbol == 'WETH' ? 'ETH' : pool.underlyingSymbol,
        tvlUsd: totalSupplyUsd - totalBorrowUsd,
        apyBase: Number(pool.supplyRate),
        apyReward: 0,
        underlyingTokens: [pool.underlyingAddress],
        rewardTokens: [],
        // borrow fields
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(pool.borrowRate),
        apyRewardBorrow: 0,
        ltv: Number(pool.collateralFactor),
        incentives: [] //helper
      }
    })
    .filter(e => e.ltv)

  const mrd_markets = await multicallMRD(base_res.markets.map(r => r.id))

  const prices_id = mrd_markets.flat().reduce((prev, curr) => {
    const [
      _owner,
      _emissionToken,
      _endTime,
      _supplyGlobalIndex,
      _supplyGlobalTimestamp,
      _borrowGlobalIndex,
      _borrowGlobalTimestamp,
      _supplyEmissionsPerSec,
      _borrowEmissionsPerSec
    ] = curr

    let lookup
    if (
      _emissionToken.toLowerCase() ==
      '0xff8adec2221f9f4d8dfbafa6b9a297d17603493d'
    ) {
      //WELL base -> WELL moonbeam
      lookup = `moonbeam:0x511ab53f793683763e5a8829738301368a2411e3`
    } else {
      lookup = `base:${_emissionToken}`
    }
    return {
      ...prev,
      [_emissionToken]: lookup
    }
  }, {})

  const mrd_prices = await getPrices(Object.values(prices_id))

  const SECONDS_PER_DAY = 86400
  const DAYS_PER_YEAR = 365
  const NOW = new Date().getTime() / 1000

  let marketIdx = 0
  for (let market of baseResults) {
    let marketRewards = mrd_markets[marketIdx]
    for (let marketWithRewards of marketRewards) {
      const [
        _owner,
        _emissionToken,
        _endTime,
        _supplyGlobalIndex,
        _supplyGlobalTimestamp,
        _borrowGlobalIndex,
        _borrowGlobalTimestamp,
        _supplyEmissionsPerSec,
        _borrowEmissionsPerSec
      ] = marketWithRewards

      let token_info
      if (
        _emissionToken.toLowerCase() ==
        '0xff8adec2221f9f4d8dfbafa6b9a297d17603493d'
      ) {
        //WELL base -> WELL moonbeam
        token_info = mrd_prices['0x511ab53f793683763e5a8829738301368a2411e3']
      } else {
        token_info = mrd_prices[_emissionToken.toLowerCase()]
      }

      let price = token_info?.price
      let decimals = token_info?.decimals
      let symbol = token_info?.symbol

      //only active
      if (_endTime > NOW) {
        const supplyRewardsPerDay =
          (_supplyEmissionsPerSec / Math.pow(-10, decimals)) * SECONDS_PER_DAY

        const supplyRewardsPerDayUSD = supplyRewardsPerDay * price

        const borrowRewardsPerDay =
          (_borrowEmissionsPerSec / Math.pow(-10, decimals)) * SECONDS_PER_DAY

        const borrowRewardsPerDayUSD = borrowRewardsPerDay * price

        market.incentives.push({
          address: _emissionToken,
          supplyRewardsAPR:
            market.totalSupplyUsd > 0
              ? (supplyRewardsPerDayUSD / market.totalSupplyUsd) *
                DAYS_PER_YEAR *
                100
              : 0,
          borrowRewardsAPR:
            market.totalBorrowUsd > 0
              ? (borrowRewardsPerDayUSD / market.totalBorrowUsd) *
                DAYS_PER_YEAR *
                100
              : 0
        })
      }
    }
    marketIdx++
  }

  for (let market of baseResults) {
    const supplyIncentivesAPR = market.incentives.reduce(
      (prev, curr) => prev + curr.supplyRewardsAPR,
      0
    )

    const borrowIncentivesAPR = market.incentives.reduce(
      (prev, curr) => prev + curr.borrowRewardsAPR,
      0
    )

    market.rewardTokens = market.incentives.map(r => r.address)
    market.apyReward = supplyIncentivesAPR
    market.apyRewardBorrow = parseFloat(
      Math.abs(borrowIncentivesAPR).toFixed(6)
    )

    delete market.incentives
  }

  return [...moonbeamResults, ...baseResults]
}

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://moonwell.fi/markets'
}
