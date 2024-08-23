const { getGlobalData, getInstrumentData, getPriceMap } = require('./getter')
const { getSymbol, getUrl, getChain, getTokenAddress } = require('./codec')
const { calculateTVL, calculateBorrowAndLendAPR } = require('./calculations')

function translateInstrumentData(initTimestamp, priceData, instrument) {
  // Load token name, chain and price
  const symbol = getSymbol(instrument.assetId)
  const chain = getChain(instrument.assetId)
  const price = priceData[instrument.assetId]
  if (symbol === undefined || chain === undefined || price === undefined) return undefined

  // Calculate fields
  const { tvlUsd, totalBorrowUsd, totalSupplyUsd } = calculateTVL(price, instrument.borrowed, instrument.liquidity)
  const { borrowApr, lendApr } = calculateBorrowAndLendAPR(initTimestamp, instrument)

  return {
    pool: `${instrument.assetId}-algorand`,
    chain,
    project: 'c3-exchange',
    symbol,
    tvlUsd,
    apyBase: lendApr * 100,
    underlyingTokens: getTokenAddress(instrument.assetId),
    apyBaseBorrow: borrowApr * 100,
    totalSupplyUsd,
    totalBorrowUsd,
    url: getUrl(instrument.assetId),
    // apyReward?: number
    // rewardTokens?: Array<string>
    // poolMeta?: string
    // apyRewardBorrow?: number;
    // ltv?: number
  }
}

async function apy() {
  // Load relevant on-chain data
  const globalData = await getGlobalData()
  const priceData = await getPriceMap(globalData)
  const result = globalData.instruments
    .map((x) => translateInstrumentData(globalData.initTimestamp, priceData, x))
    .filter((x) => x !== undefined)
  
  return result
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://c3.io/earn',
}
