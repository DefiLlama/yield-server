const utils = require('../utils')
const sdk = require('@defillama/sdk');

const apy = async () => {
  const vaultsData = await utils.getData('https://gateway.wasabi.xyz/vaults')
  return vaultsData.items.map(data => {
    const vault = data.vault;
    const token = data.token;
    const totalBorrowUsd = data.tvlUsd * data.utilizationRate;
    const apr = data.apr + data.nativeApr;
    const isRewardAPY = vault.chain === 'berachain' && token.symbol === 'WBERA';
    const isDeprecated = vault.deprecated;
    return {
      pool: `wasabi-${vault.chain}-${vault.symbol}`,
      chain: vault.chain === "mainnet" ? "Ethereum" : utils.formatChain(vault.chain),
      project: 'wasabi',
      symbol: token.symbol,
      tvlUsd: isDeprecated ? 0 : data.tvlUsd,
      apyBase: isRewardAPY ? 0 : apr * 100,
      apyReward: isRewardAPY ? apr * 100 : 0,
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
