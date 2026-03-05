const { getData } = require('../avant-aveth/shared')

// Avalanche tokens
const avUSD  = '0x24dE8771bC5DdB3362Db529Fc3358F2df3A0E346'
const savUSD = '0x06d47F3fb376649c3A9Dafe069B3D6E35572219E' // Staked avUSD (ERC-4626)

async function apy() {
  const savUSDData = await getData('avax', savUSD, avUSD)

  return [
    {
      pool: `${savUSD}-avax`,
      chain: 'avax',
      project: 'avant-avusd',
      symbol: 'savUSD',
      tvlUsd: savUSDData.tvlUsd,
      apyBase: savUSDData.apyBase,
      underlyingTokens: [avUSD],
      poolMeta: 'ERC-4626: savUSD → avUSD',
      url: 'https://www.avantprotocol.com',
    },
  ]
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.avantprotocol.com',
}
