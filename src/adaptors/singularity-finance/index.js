const sdk = require('@defillama/sdk');
const utils = require('../utils');

const baseVaultRegistry = "0xe260c97949bB01E49c0af64a3525458197851657";

async function getApy() {
  const numberOfVaults = (await sdk.api.abi.call({
    abi: 'function nrOfVaults() view returns (uint256)',
    target: baseVaultRegistry,
    chain: "base"
  })).output;

  const batchSize = 100;
  let results = [];

  for (let i = 0; i < numberOfVaults; i += batchSize) {
    const dynaVaults = (await sdk.api.abi.call({
      abi: 'function getVaults(uint256 offset, uint256 size) view returns (tuple(address vault, uint8 VaultType, bool active)[] memory)',
      target: baseVaultRegistry,
      chain: "base",
      params: [
        BigInt(i),
        BigInt(batchSize),
      ],
    })).output;

    const subResults = await Promise.all(dynaVaults.filter(vault => vault.active).map(async (vault, index) => {
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

    results.push(...subResults);
  }

  return results;
}

module.exports = {
  timetravel: false,
  apy: getApy,
};

