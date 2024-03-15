const BigNumber = require('bignumber.js');
const utils = require('../utils');
const { calcRewardsAPY } = require('./utils/math.js');
const { getMoneyMarkets, getTokenPrices, getExchangeRates, getRewardsBatches, getBoostedRewards, getBoostedColateralMap } = require('./utils/data.js');

const MARKETS = [
   { symbol: "USDC", address: "erd1qqqqqqqqqqqqqpgqkrgsvct7hfx7ru30mfzk3uy6pxzxn6jj78ss84aldu" },
   { symbol: 'WBTC', address: "erd1qqqqqqqqqqqqqpgqg47t8v5nwzvdxgf6g5jkxleuplu8y4f678ssfcg5gy" },
   { symbol: "WETH", address: "erd1qqqqqqqqqqqqqpgq8h8upp38fe9p4ny9ecvsett0usu2ep7978ssypgmrs" },
   { symbol: "USDT", address: "erd1qqqqqqqqqqqqqpgqvxn0cl35r74tlw2a8d794v795jrzfxyf78sstg8pjr" }
]

const apy = async () => {
   const [mm, prices, rewards] = await Promise.all([
      getMoneyMarkets(),
      getTokenPrices(),
      getRewardsBatches(),
   ]);
   const exchangeRates = getExchangeRates(mm)

   return MARKETS.map(({ symbol }) => {
      const currentMM = mm[symbol]
      const currentPrice = prices[symbol]
      const currentExchangeRate = exchangeRates[symbol]
      const currentRewards = rewards[symbol]

      const rewardsAPY = calcRewardsAPY({
         speed: currentRewards.speed,
         hTokenExchangeRate: currentExchangeRate,
         totalCollateral: currentMM.totalColateral.toString(),
         marketPrice: currentPrice,
         rewardsToken: currentRewards.rewardsToken,
         rewardsTokenPrice: prices[currentRewards.rewardsToken.symbol],
         marketDecimals: currentMM.decimals
      })

      const tvlUsd = new BigNumber(currentMM.cash).multipliedBy(currentPrice).dividedBy(`1e${currentMM.decimals}`).toNumber()
      const apyBase = mm[symbol].supplyAPY
      const apyReward = new BigNumber(rewardsAPY).toNumber()
      return {
         pool: symbol,
         chain: 'MultiversX',
         project: 'hatom-lending',
         symbol: symbol,
         tvlUsd: tvlUsd,
         apyBase: apyBase,
         apyReward: apyReward,
         rewardTokens: [currentRewards.rewardsToken.symbol],
      }
   })
}

module.exports = {
   timetravel: false,
   apy: apy,
   url: 'https://app.hatom.com/lend',
};