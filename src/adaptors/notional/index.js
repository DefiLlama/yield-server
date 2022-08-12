const utils = require('../utils');
const main = async () => {
  return await utils.getData('https://notional.finance/.netlify/functions/yields')
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://notional.finance'
}

// Example Result:
// [
//   {
//     pool: 'nUSDC',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'USDC',
//     tvlUsd: 36638848.70540169,
//     apyBase: 0.453939,
//     apyReward: 7.467707,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' ]
//   },
//   {
//     pool: 'nDAI',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'DAI',
//     tvlUsd: 31774687.60005936,
//     apyBase: -0.5340534,
//     apyReward: 7.9730419999999995,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'fUSDC Maturing 2022-09-25',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'USDC',
//     tvlUsd: 20919147.39396627,
//     apyBase: 2.7520372,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' ]
//   },
//   {
//     pool: 'fDAI Maturing 2022-09-25',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'DAI',
//     tvlUsd: 18951230.51956975,
//     apyBase: 2.6238908,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'fDAI Maturing 2022-12-24',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'DAI',
//     tvlUsd: 17561724.71119394,
//     apyBase: 3.5201129,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'fUSDC Maturing 2022-12-24',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'USDC',
//     tvlUsd: 14650691.58602777,
//     apyBase: 2.6811675999999998,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' ]
//   },
//   {
//     pool: 'nETH',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'ETH',
//     tvlUsd: 9182888.44486583,
//     apyBase: 0.2509782,
//     apyReward: 3.3106040000000005,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5' ]
//   },
//   {
//     pool: 'fDAI Maturing 2023-06-22',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'DAI',
//     tvlUsd: 7548385.04100475,
//     apyBase: 4.9790529,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'nWBTC',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'WBTC',
//     tvlUsd: 6244228.82978403,
//     apyBase: 0.07452109999999999,
//     apyReward: 4.544065,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599' ]
//   },
//   {
//     pool: 'fETH Maturing 2022-12-24',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'ETH',
//     tvlUsd: 4337768.0747647,
//     apyBase: 0.7884739999999999,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5' ]
//   }
// ]