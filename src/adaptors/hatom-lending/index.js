const BigNumber = require('bignumber.js');
const utils = require('../utils');
const { calcRewardsAPY } = require('./utils/math.js');
const { getMoneyMarkets, getTokenPrices, getExchangeRates, getRewardsBatches, getBoostedRewards, getBoostedColateralMap } = require('./utils/data.js');

const MARKETS = [
  { symbol: 'EGLD', address: 'erd1qqqqqqqqqqqqqpgq35qkf34a8svu4r2zmfzuztmeltqclapv78ss5jleq3' },
  { symbol: 'SEGLD', address: 'erd1qqqqqqqqqqqqqpgqxmn4jlazsjp6gnec95423egatwcdfcjm78ss5q550k' },
  { symbol: 'WBTC', address: 'erd1qqqqqqqqqqqqqpgqg47t8v5nwzvdxgf6g5jkxleuplu8y4f678ssfcg5gy' },
  { symbol: 'WETH', address: 'erd1qqqqqqqqqqqqqpgq8h8upp38fe9p4ny9ecvsett0usu2ep7978ssypgmrs' },
  { symbol: 'USDC', address: 'erd1qqqqqqqqqqqqqpgqkrgsvct7hfx7ru30mfzk3uy6pxzxn6jj78ss84aldu' },
  { symbol: 'USDT', address: 'erd1qqqqqqqqqqqqqpgqvxn0cl35r74tlw2a8d794v795jrzfxyf78sstg8pjr' },
  { symbol: 'UTK', address: 'erd1qqqqqqqqqqqqqpgqta0tv8d5pjzmwzshrtw62n4nww9kxtl278ssspxpxu' },
  { symbol: 'HTM', address: 'erd1qqqqqqqqqqqqqpgqxerzmkr80xc0qwa8vvm5ug9h8e2y7jgsqk2svevje0' },
  { symbol: 'WTAO', address: 'erd1qqqqqqqqqqqqqpgqz9pvuz22qvqxfqpk6r3rluj0u2can55c78ssgcqs00' },
  { symbol: 'SWTAO', address: 'erd1qqqqqqqqqqqqqpgq7sspywe6e2ehy7dn5dz00ved3aa450mv78ssllmln6'},
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