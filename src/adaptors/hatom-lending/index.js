const BigNumber = require('bignumber.js');
const utils = require('../utils');
const { calcMarketAPY, getRewardTokenAPY, getTotalBoosterAPY } = require('./utils/math.js');

const MARKETS = [
   { symbol: 'WBTC', address: "erd1qqqqqqqqqqqqqpgqg47t8v5nwzvdxgf6g5jkxleuplu8y4f678ssfcg5gy" },
   { symbol: "WETH", address: "erd1qqqqqqqqqqqqqpgq8h8upp38fe9p4ny9ecvsett0usu2ep7978ssypgmrs" },
   { symbol: "USDC", address: "erd1qqqqqqqqqqqqqpgqkrgsvct7hfx7ru30mfzk3uy6pxzxn6jj78ss84aldu" },
   { symbol: "USDT", address: "erd1qqqqqqqqqqqqqpgqvxn0cl35r74tlw2a8d794v795jrzfxyf78sstg8pjr" }
]

const apy = async () => {
   return MARKETS.map((market) => {
      const tvlUsd = 100000
      const apyBase = 100
      const apyReward = 100
      return {
         pool: market.symbol,
         chain: 'MultiversX',
         project: 'hatom-lending',
         symbol: market.symbol,
         tvlUsd: tvlUsd,
         apyBase: apyBase,
         apyReward: apyReward,
         rewardTokens: ['USDC']
      }
   })
}


module.exports = {
   timetravel: false,
   apy: apy,
   url: 'https://app.hatom.com/lend',
};