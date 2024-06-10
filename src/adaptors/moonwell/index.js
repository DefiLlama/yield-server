const utils = require('../utils')
const sdk = require('@defillama/sdk')
const { request, gql, batchRequests } = require('graphql-request')
const { MRD_ABI, VIEWS_ABI } = require('./abi')
const axios = require('axios')

const MRD_CONTRACT = '0xe9005b078701e2A0948D2EaC43010D35870Ad9d2'
const MOONBEAM_VIEWS_CONTRACT = '0xe76C8B8706faC85a8Fbdcac3C42e3E7823c73994'
const BASE_VIEWS_CONTRACT = '0x821Ff3a967b39bcbE8A018a9b1563EAf878bad39'

const SECONDS_PER_DAY = 86400
const DAYS_PER_YEAR = 365
const NOW = new Date().getTime() / 1000

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

const multicallViews = async (network) => {
  return (
    await sdk.api.abi.multiCall({
      chain: network,
      calls: [{
        target: network == 'moonbeam' ? MOONBEAM_VIEWS_CONTRACT : BASE_VIEWS_CONTRACT,
        params: []
      }],
      abi: VIEWS_ABI.find(({ name }) => name === 'getAllMarketsInfo')
    })
  ).output.map(({ output }) => output)
}

const API_URL =
  'https://ponder.moonwell.fi/'

const query = gql`
  {
    markets(limit:1000) {
      items {
        id,
        address,
        chainId,
        collateralFactor
        interestRateModelAddress
        priceFeedAddress
        reserveFactor
        underlyingTokenAddress
      }
    }
  	tokens(limit:1000) {
      items {
        id
        address
        chainId
        symbol
        decimals
      }
    }
  }
`

const getApy = async () => {

  const ponder_markets_res = await request(API_URL, query)

  const ponder_markets = ponder_markets_res.markets.items;
  const ponder_tokens = ponder_markets_res.tokens.items;

  const moonbeam_markets = await multicallViews('moonbeam')
  let moonbeamResults

  if (moonbeam_markets && moonbeam_markets.length == 1) {
    const moonbeam_markets_data = moonbeam_markets[0]

    moonbeamResults = moonbeam_markets_data
      .filter(pool => pool.isListed)
      .map(pool => {

        const { market, collateralFactor, underlyingPrice, totalSupply, totalBorrows, exchangeRate, borrowRate, supplyRate } = pool;

        const market_info = ponder_markets.find(r => r.address.toLowerCase() == market.toLowerCase() && r.chainId == 1284)
        const token_info = ponder_tokens.find(r => r.address.toLowerCase() == market_info.underlyingTokenAddress.toLowerCase() && r.chainId == 1284)

        const totalSupplyScaled = Number(totalSupply) / Math.pow(10, 8)
        const totalBorrowsScaled = Number(totalBorrows) / Math.pow(10, token_info.decimals)
        const exchangeRateScaled = Number(exchangeRate) / Math.pow(10, token_info.decimals + 10)
        const underlyingPriceScaled = Number(underlyingPrice) / Math.pow(10, 36 - token_info.decimals)

        const totalSupplyUsd =
          Number(totalSupplyScaled) * Number(exchangeRateScaled) * underlyingPriceScaled
        const totalBorrowUsd = Number(totalBorrowsScaled) * underlyingPriceScaled

        const supplyRateScaled = Number(supplyRate) / Math.pow(10, 18)
        const borrowRateScaled = Number(borrowRate) / Math.pow(10, 18)
        const collateralFactorScaled = Number(collateralFactor) / Math.pow(10, 18)

        const supplyApy = ((((supplyRateScaled * SECONDS_PER_DAY) + 1) ** DAYS_PER_YEAR) - 1) * 100
        const borrowApy = ((((borrowRateScaled * SECONDS_PER_DAY) + 1) ** DAYS_PER_YEAR) - 1) * 100

        return {
          pool: market.toLowerCase(),
          chain: utils.formatChain('moonbeam'),
          project: 'moonwell',
          symbol: token_info.symbol,
          tvlUsd: totalSupplyUsd - totalBorrowUsd,
          apyBase: supplyApy,
          apyReward: 0,
          underlyingTokens: [
            market_info.underlyingTokenAddress.toLowerCase() ===
              '0x0000000000000000000000000000000000000000'
              ? '0xAcc15dC74880C9944775448304B263D191c6077F'.toLowerCase()
              : market_info.underlyingTokenAddress.toLowerCase()
          ],
          rewardTokens: [
            '0x511ab53f793683763e5a8829738301368a2411e3',
            '0xacc15dc74880c9944775448304b263d191c6077f'
          ],
          // borrow fields
          totalSupplyUsd,
          totalBorrowUsd,
          apyBaseBorrow: borrowApy,
          apyRewardBorrow: 0,
          ltv: collateralFactorScaled,
          incentives: [] //helper
        }
      })
      .filter(e => e.ltv)

  }

  let moonbeam_incentives = {}
  if (moonbeam_markets && moonbeam_markets.length == 1) {
    const moonbeam_markets_data = moonbeam_markets[0]
    for (const _market of moonbeam_markets_data) {
      const _incentives = _market[17] // incentives      
      moonbeam_incentives[_market[0].toLowerCase()] = _incentives.map((i) => {
        return {
          rewardToken: i[0].toLowerCase(),
          supplyIncentivesPerSec: i[1],
          borrowIncentivesPerSec: i[2],
        }
      })
    }
  }

  const moonbeam_prices_id = Object.values(moonbeam_incentives).flat().reduce((prev, curr) => {
    let _emissionToken = curr.rewardToken;
    let lookup
    if (
      _emissionToken.toLowerCase() ==
      '0xff8adec2221f9f4d8dfbafa6b9a297d17603493d'
    ) {
      //WELL base -> WELL moonbeam
      lookup = `moonbeam:0x511ab53f793683763e5a8829738301368a2411e3`
    } else {
      lookup = `moonbeam:${_emissionToken}`
    }
    return {
      ...prev,
      [_emissionToken]: lookup
    }
  }, {})

  const moonbeam_prices = await getPrices(Object.values(moonbeam_prices_id))

  for (let market of moonbeamResults) {
    let marketRewards = moonbeam_incentives[market.pool]

    for (let marketWithRewards of marketRewards) {
      const {
        rewardToken: _emissionToken,
        supplyIncentivesPerSec: _supplyEmissionsPerSec,
        borrowIncentivesPerSec: _borrowEmissionsPerSec
      } = marketWithRewards

      let token_info = moonbeam_prices[_emissionToken.toLowerCase()]

      if (!token_info) continue
      let price = token_info.price
      let decimals = token_info.decimals
      let symbol = token_info.symbol

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

  for (let market of moonbeamResults) {
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

  const base_markets = await multicallViews('base')
  let baseResults

  if (base_markets && base_markets.length == 1) {
    const base_markets_data = base_markets[0]

    baseResults = base_markets_data
      .filter(pool => pool.isListed)
      .map(pool => {

        const { market, collateralFactor, underlyingPrice, totalSupply, totalBorrows, exchangeRate, borrowRate, supplyRate } = pool;

        const market_info = ponder_markets.find(r => r.address.toLowerCase() == market.toLowerCase() && r.chainId == 8453)
        const token_info = ponder_tokens.find(r => r.address.toLowerCase() == market_info.underlyingTokenAddress.toLowerCase() && r.chainId == 8453)

        const totalSupplyScaled = Number(totalSupply) / Math.pow(10, 8)
        const totalBorrowsScaled = Number(totalBorrows) / Math.pow(10, token_info.decimals)
        const exchangeRateScaled = Number(exchangeRate) / Math.pow(10, token_info.decimals + 10)
        const underlyingPriceScaled = Number(underlyingPrice) / Math.pow(10, 36 - token_info.decimals)

        const totalSupplyUsd =
          Number(totalSupplyScaled) * Number(exchangeRateScaled) * underlyingPriceScaled
        const totalBorrowUsd = Number(totalBorrowsScaled) * underlyingPriceScaled

        const supplyRateScaled = Number(supplyRate) / Math.pow(10, 18)
        const borrowRateScaled = Number(borrowRate) / Math.pow(10, 18)
        const collateralFactorScaled = Number(collateralFactor) / Math.pow(10, 18)

        const supplyApy = ((((supplyRateScaled * SECONDS_PER_DAY) + 1) ** DAYS_PER_YEAR) - 1) * 100
        const borrowApy = ((((borrowRateScaled * SECONDS_PER_DAY) + 1) ** DAYS_PER_YEAR) - 1) * 100

        return {
          pool: market.toLowerCase(),
          chain: utils.formatChain('base'),
          project: 'moonwell',
          symbol: token_info.symbol == 'WETH' ? 'ETH' : token_info.symbol,
          tvlUsd: totalSupplyUsd - totalBorrowUsd,
          apyBase: supplyApy,
          apyReward: 0,
          underlyingTokens: [token_info.address],
          rewardTokens: [],
          // borrow fields
          totalSupplyUsd,
          totalBorrowUsd,
          apyBaseBorrow: borrowApy,
          apyRewardBorrow: 0,
          ltv: Number(collateralFactorScaled),
          incentives: [] //helper
        }
      })
      .filter(e => e.ltv)
  }

  const mrd_markets = await multicallMRD(baseResults.map(r => r.pool))

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

      if (!token_info) continue

      let price = token_info.price
      let decimals = token_info.decimals
      let symbol = token_info.symbol

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
