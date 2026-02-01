const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const baseVaultRegistry = "0xe260c97949bB01E49c0af64a3525458197851657";
const USDC = { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, symbol: "USDC" };

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
      abi: 'function getVaults(uint256 offset, uint256 size) view returns (tuple(address vault, uint8 vaultType, bool active)[] memory)',
      target: baseVaultRegistry,
      chain: "base",
      params: [
        BigInt(i),
        BigInt(batchSize),
      ],
    })).output;

    // vault type: 3 = beta, 4 = production
    const activeVaultsInProdOrBeta = dynaVaults.filter(vault => vault.active && (vault.vaultType == 3 || vault.vaultType == 4));
    const vaultInfos = await multiGetERC4626Infos(activeVaultsInProdOrBeta.map(vault => vault.vault), "base");

    const subResults = await Promise.all(activeVaultsInProdOrBeta.map(async (vault, index) => {
      const referenceAssetAddress = (await sdk.api.abi.call({
        abi: 'function referenceAsset() view returns (address)',
        target: vault.vault,
        chain: "base",
      })).output;

      const referenceAssetSymbol = (await sdk.api.abi.call({
        abi: 'function symbol() view returns (string)',
        target: referenceAssetAddress,
        chain: "base",
      })).output;

      const { tvl, apyBase, ...rest } = vaultInfos[index];

      const tvlUsd = referenceAssetAddress == USDC.address ? tvl : (await sdk.api.abi.call({
        abi: 'function tokenValueInQuoteAsset(address base, uint256 amount, address quote) view returns (uint256 value)',
        target: vault.vault,
        chain: "base",
        params: [
          referenceAssetAddress,
          tvl,
          USDC.address,
        ],
      })).output;

      return {
        pool: vault.vault,
        chain: "base",
        project: 'singularity-finance',
        symbol: utils.formatSymbol(referenceAssetSymbol),
        tvlUsd: tvlUsd / 10 ** USDC.decimals,
        apyBase,
        url: `https://singularityfinance.ai/vaults/${vault.vault}:8453`,
      };
    }));

    if (subResults != []) results.push(...subResults);
  }

  return results;
}

// multicall version of getERC4625Info found in utils
async function multiGetERC4626Infos(
  addresses,
  chain,
  timestamp = Math.floor(Date.now() / 1e3),
  {
    assetUnit = '100000000000000000',
    totalAssetsAbi = 'uint:totalAssets',
    convertToAssetsAbi = 'function convertToAssets(uint256 shares) external view returns (uint256)',
  } = {}
) {
  const DAY = 24 * 3600;

  const [blockNow, blockYesterday] = await Promise.all(
    [timestamp, timestamp - DAY].map((time) =>
      axios
        .get(`https://coins.llama.fi/block/${chain}/${time}`)
        .then((r) => r.data.height)
    )
  );

  const allTotalAssets = (await sdk.api.abi.multiCall({
    calls: addresses.map(a => ({
      target: a,
    })),
    block: blockNow,
    abi: totalAssetsAbi,
    chain
  })).output.map(result => result.output);

  const allPriceNow = (await sdk.api.abi.multiCall({
    calls: addresses.map(a => ({
      target: a,
      params: [assetUnit],
    })),
    block: blockNow,
    abi: convertToAssetsAbi,
    chain
  })).output.map(result => result.output);

  const allPriceYesterday = (await sdk.api.abi.multiCall({
    calls: addresses.map(a => ({
      target: a,
      params: [assetUnit],
    })),
    block: blockYesterday,
    abi: convertToAssetsAbi,
    chain
  })).output.map(result => result.output);

  const apy = (priceNow, priceYesterday) => (priceNow / priceYesterday) ** 365 * 100 - 100;

  return await Promise.all(
    addresses.map((address, index) => ({
      pool: address,
      chain,
      tvl: allTotalAssets[index],
      apyBase: apy(allPriceNow[index], allPriceYesterday[index]),
    }))
  );
};

module.exports = {
  timetravel: false,
  apy: getApy,
};

