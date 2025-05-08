const utils = require('../utils')

const apy = async () => {
  const vaultsData = await utils.getData('https://gateway.wasabi.xyz/vaults')
  return vaultsData.items.map(data => {
    const vault = data.vault;
    const token = data.token;
    const poolState = data.poolState;
    const totalBorrowUsd = data.tvlUsd * data.utilizationRate;
    const isRewardAPY = vault.chain === 'berachain' && token.symbol === 'WBERA';
    return {
      pool: `wasabi-${vault.chain}-${vault.symbol}`,
      chain: vault.chain === "mainnet" ? "Ethereum" : utils.formatChain(vault.chain),
      project: 'wasabi',
      symbol: token.symbol,
      tvlUsd: data.tvlUsd,
      apyBase: isRewardAPY ? 0 : data.apr * 100,
      apyReward: isRewardAPY ? data.apr * 100 : 0,
      underlyingTokens: [vault.tokenAddress],
      rewardTokens: isRewardAPY ? ["0xac03CABA51e17c86c921E1f6CBFBdC91F8BB2E6b"] : [],
      totalSupplyUsd: data.tvlUsd,
      totalBorrowUsd,
      url: `https://app.wasabi.xyz/earn?vault=${vault.symbol}&network=${vault.chain}`,
    }
  })
}

module.exports = {
  timetravel: false,
  apy
}
