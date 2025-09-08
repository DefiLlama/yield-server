const utils = require('../utils');

const baseChainId = 8453;

async function getApy() {
  const data = await utils.getData(
    "https://dynavaults-api.singularityfinance.ai/api/manager/dynavaults-backend/vaults"
  );

  return await Promise.all(data.filter(vault => !vault.isClosed && vault.chainId == baseChainId).map(async (vault) => {
    const vaultInfo = await utils.getERC4626Info(vault.address, "base");
    const { tvl, apyBase, ...rest } = vaultInfo;

    return {
      pool: vault.address,
      chain: "base",
      project: 'singularity-finance',
      symbol: utils.formatSymbol("USDC"),
      tvlUsd: tvl / 1e6,
      apyBase,
      url: `https://singularityfinance.ai/vaults/${vault.address}`,
    };
  }));
}

module.exports = {
  timetravel: false,
  apy: getApy,
};

