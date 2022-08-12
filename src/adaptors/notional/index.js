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
//   {
//     pool: 'nUSDC',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'nUSDC',
//     tvlUsd: 36638892.1282562,
//     apyBase: 0.4544424,
//     apyReward: 7.470707999999999,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' ]
//   },
//   {
//     pool: 'nDAI',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'nDAI',
//     tvlUsd: 31767138.54877147,
//     apyBase: -0.5336467,
//     apyReward: 7.978151,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'fUSDC Maturing 2022-09-25',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'fUSDC Maturing 2022-09-25',
//     tvlUsd: 20919175.94310323,
//     apyBase: 2.7520377,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' ]
//   },
//   {
//     pool: 'fDAI Maturing 2022-09-25',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'fDAI Maturing 2022-09-25',
//     tvlUsd: 18946773.36221967,
//     apyBase: 2.6238911,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'fDAI Maturing 2022-12-24',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'fDAI Maturing 2022-12-24',
//     tvlUsd: 17557594.35298627,
//     apyBase: 3.520113,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'fUSDC Maturing 2022-12-24',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'fUSDC Maturing 2022-12-24',
//     tvlUsd: 14650711.58035181,
//     apyBase: 2.6811678,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' ]
//   },
//   {
//     pool: 'nETH',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'nETH',
//     tvlUsd: 9276686.98507859,
//     apyBase: 0.2509837,
//     apyReward: 3.2784510000000004,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5' ]
//   },
//   {
//     pool: 'fDAI Maturing 2023-06-22',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'fDAI Maturing 2023-06-22',
//     tvlUsd: 7546609.72938641,
//     apyBase: 4.979053,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'nWBTC',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'nWBTC',
//     tvlUsd: 6238149.31790781,
//     apyBase: 0.07452099999999999,
//     apyReward: 4.550327,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599' ]
//   },
//   {
//     pool: 'fETH Maturing 2022-12-24',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'fETH Maturing 2022-12-24',
//     tvlUsd: 4382074.34523764,
//     apyBase: 0.7884739999999999,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5' ]
//   }
// ]
