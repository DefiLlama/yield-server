const sdk = require('@defillama/sdk');
const utils = require('../utils');

const baseChainId = 8453;
const baseVaultRegistry = "0x414F0e07cd833cE73c9d59280699f910b48E1ECb";

async function getApy() {
  const dynaVaults = (await sdk.api.abi.call({
    abi: 'function allVaults() view returns (tuple(address vault, uint8 VaultType, bool active)[] memory)',
    target: baseVaultRegistry,
    chain: "base"
  })).output;


  return await Promise.all(dynaVaults.map(async (vault) => {
    const vaultInfo = await utils.getERC4626Info(vault.vault, "base");
    const { tvl, apyBase, ...rest } = vaultInfo;

    return {
      pool: vault.vault,
      chain: "base",
      project: 'singularity-finance',
      symbol: utils.formatSymbol("USDC"),
      tvlUsd: tvl / 1e6,
      apyBase,
      url: `https://singularityfinance.ai/vaults/${vault.vault}`,
    };
  }));
}

module.exports = {
  timetravel: false,
  apy: getApy,
};

