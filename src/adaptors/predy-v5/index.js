const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js')
const { getAsset } = require('./queries')
const { calculateInterestRate } = require('./helpers')

const pairs = [{
  pairId: 1,
  symbol: 'WETH',
  tokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  decimals: 18
}, {
  pairId: 2,
  symbol: 'ARB',
  tokenAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  decimals: 18
}, {
  pairId: 3,
  symbol: 'WBTC',
  tokenAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  decimals: 8
}, {
  pairId: 4,
  symbol: 'GYEN',
  tokenAddress: '0x589d35656641d6aB57A545F08cf473eCD9B6D5F7',
  decimals: 6
}, {
  pairId: 5,
  symbol: 'LUSD',
  tokenAddress: '0x93b346b6BC2548dA6A1E7d98E9a421B42541425b',
  decimals: 18
}, {
  pairId: 6,
  symbol: 'WETH',
  tokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  decimals: 18,
  isEx: true
}]

const ONE = 10 ** 18
const ZERO = new BigNumber(0)

function getLendingSummary(
  scaledAssetStatus,
  irmParams,
  price,
  decimals
) {
  const supply = (new BigNumber(scaledAssetStatus.totalCompoundDeposited)).times(scaledAssetStatus.assetScaler).div(ONE)
    .plus(scaledAssetStatus.totalNormalDeposited)
  const borrow = new BigNumber(scaledAssetStatus.totalNormalBorrowed)
  const ur = supply.eq(ZERO) ? ZERO : borrow.times(ONE).div(supply)

  const borrowInterest = calculateInterestRate(irmParams, ur)
  const supplyInterest = supply.eq(ZERO)
    ? ZERO
    : borrowInterest.times(borrow).div(supply)

  return {
    supply: (supply.toNumber() / (10 ** decimals)) * price,
    borrow: (borrow.toNumber() / (10 ** decimals)) * price,
    apy: supplyInterest.toNumber() / (10 ** 16)
  }
}


const lendingApys = async () => {
  const controller = '0x06a61E55d4d4659b1A23C0F20AEdfc013C489829'
  const usdcAddress = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'

  const priceKeys = pairs
    .map((t) => `arbitrum:${t.tokenAddress}`)
    .concat([`arbitrum:${usdcAddress}`])
    .join(',');
  const pricesEthereum = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;


  return await Promise.all(
    pairs.map(async (pair) => {
      const usdcPrice = pricesEthereum[`arbitrum:${usdcAddress}`]?.price;
      const price = pricesEthereum[`arbitrum:${pair.tokenAddress}`]?.price;

      const pairStatus = await getAsset(controller, pair.pairId);

      const stableSummary = getLendingSummary(pairStatus.stablePool.tokenStatus, pairStatus.stablePool.irmParams, usdcPrice, 6)
      const underlyingSummary = getLendingSummary(pairStatus.underlyingPool.tokenStatus, pairStatus.underlyingPool.irmParams, price, pair.decimals)

      const stableSupplyToken = pairStatus.stablePool.supplyTokenAddress
      const underlyingSupplyToken = pairStatus.underlyingPool.supplyTokenAddress

      const pairName = pair.symbol + '-USDC.e' + (pair.isEx ? '.ex' : '')

      return [{
        pool: `${stableSupplyToken}-arbitrum`,
        chain: 'Arbitrum',
        project: 'predy',
        symbol: `USDC.e (${pairName})`,
        tvlUsd: stableSummary.supply - stableSummary.borrow,
        totalSupplyUsd: stableSummary.supply,
        totalBorrowUsd: stableSummary.borrow,
        apyBase: stableSummary.apy,
        url: `https://v5app.predy.finance/trade/usdce/main/${pair.pairId}`,
      }, {
        pool: `${underlyingSupplyToken}-arbitrum`,
        chain: 'Arbitrum',
        project: 'predy',
        symbol: `${pair.symbol} (${pairName})`,
        tvlUsd: underlyingSummary.supply - underlyingSummary.borrow,
        totalSupplyUsd: underlyingSummary.supply,
        totalBorrowUsd: underlyingSummary.borrow,
        apyBase: underlyingSummary.apy,
        url: `https://v5app.predy.finance/trade/usdce/main/${pair.pairId}`,
      }]
    })
      .flat()
  )
};

module.exports = {
  timetravel: false,
  apy: lendingApys,
  url: 'https://appv5.predy.finance',
};
