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
//     tvlUsd: 36238794.48432956,
//     apyBase: 0.45338480000000003,
//     apyReward: 7.55595,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' ]
//   },
//   {
//     pool: 'nDAI',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'DAI',
//     tvlUsd: 31768443.91147173,
//     apyBase: -0.534063,
//     apyReward: 7.980739000000001,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'fUSDC @ 2022-09-25T00:00:00.000Z',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'USDC',
//     tvlUsd: 20739111.76455388,
//     apyBase: 2.7520378,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' ]
//   },
//   {
//     pool: 'fDAI @ 2022-09-25T00:00:00.000Z',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'DAI',
//     tvlUsd: 18947450.99475349,
//     apyBase: 2.6238909,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'fDAI @ 2022-12-24T00:00:00.000Z',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'DAI',
//     tvlUsd: 17558222.30146147,
//     apyBase: 3.5201127999999997,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'fUSDC @ 2022-12-24T00:00:00.000Z',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'USDC',
//     tvlUsd: 14490666.68937943,
//     apyBase: 2.6811677,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' ]
//   },
//   {
//     pool: 'nETH',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'ETH',
//     tvlUsd: 9104996.11288865,
//     apyBase: 0.250977,
//     apyReward: 3.3414930000000003,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5' ]
//   },
//   {
//     pool: 'fDAI @ 2023-06-22T00:00:00.000Z',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'DAI',
//     tvlUsd: 7546879.63436404,
//     apyBase: 4.979053,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x6b175474e89094c44da98b954eedeac495271d0f' ]
//   },
//   {
//     pool: 'nWBTC',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'WBTC',
//     tvlUsd: 6198091.06668865,
//     apyBase: 0.0745212,
//     apyReward: 4.581409,
//     rewardTokens: [ '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5' ],
//     underlyingTokens: [ '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599' ]
//   },
//   {
//     pool: 'fETH @ 2022-12-24T00:00:00.000Z',
//     chain: 'Ethereum',
//     project: 'notional',
//     symbol: 'ETH',
//     tvlUsd: 4300975.88586898,
//     apyBase: 0.7884739999999999,
//     apyReward: null,
//     rewardTokens: null,
//     underlyingTokens: [ '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5' ]
//   }
// ]