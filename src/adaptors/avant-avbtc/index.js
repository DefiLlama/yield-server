const { getData } = require('../avant-aveth/shared')

// Avalanche tokens
const avBTC  = '0xfd2c2A98009d0cBed715882036e43d26C4289053'
const savBTC = '0x649342c6bff544d82DF1B2bA3C93e0C22cDeBa84' // Staked avBTC (ERC-4626)

async function apy() {
  const savBTCData = await getData('avax', savBTC, avBTC)

  return [
    {
      pool: `${savBTC}-avax`,
      chain: 'avax',
      project: 'avant-avbtc',
      symbol: 'savBTC',
      tvlUsd: savBTCData.tvlUsd,
      apyBase: savBTCData.apyBase,
      underlyingTokens: [avBTC],
      poolMeta: 'ERC-4626: savBTC → avBTC',
      url: 'https://www.avantprotocol.com',
    },
  ]
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.avantprotocol.com',
}
