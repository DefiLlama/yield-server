const { getData } = require('./shared')

// Ethereum tokens
const avETH  = '0x9469470C9878bf3d6d0604831d9A3A366156f7EE'
const savETH = '0xDA06eE2dACF9245Aa80072a4407deBDea0D7e341' // Staked avETH (ERC-4626)
const wETH   = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

async function apy() {
  const savETHData = await getData('ethereum', savETH, avETH, wETH)

  return [
    {
      pool: `${savETH}-ethereum`,
      chain: 'ethereum',
      project: 'avant-aveth',
      symbol: 'savETH',
      tvlUsd: savETHData.tvlUsd,
      apyBase: savETHData.apyBase,
      underlyingTokens: [avETH],
      poolMeta: 'ERC-4626: savETH → avETH',
      url: 'https://www.avantprotocol.com',
    },
  ]
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.avantprotocol.com',
}
