const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const chainConfig = {
  ethereum: {
    chainId: 1,
    registry: '0x97C46cE66Ec71559DbF43fF9E5D110C3657C1ca4',
    usdc: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  },
  bsc: {
    chainId: 56,
    registry: '0xBCCa741996196462480108BCEf7561C0aB3Fdb04',
    usdc: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  },
  base: {
    chainId: 8453,
    registry: '0xe260c97949bB01E49c0af64a3525458197851657',
    usdc: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  },
  arbitrum: {
    chainId: 42161,
    registry: '0x44921e42017316F89C1DEdd70a3A017d4c5162c3',
    usdc: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  },
};

async function getApy() {
  return (await Promise.all(Object.keys(chainConfig).map(getChainApy))).flat();
}

async function getChainApy(chain) {
  const { chainId, registry, usdc } = chainConfig[chain];
  const numberOfVaults = (await sdk.api.abi.call({
    abi: 'function nrOfVaults() view returns (uint256)',
    target: registry,
    chain
  })).output;

  const batchSize = 100;

  let results = [];

  for (let i = 0; i < numberOfVaults; i += batchSize) {
    const dynaVaults = (await sdk.api.abi.call({
      abi: 'function getVaults(uint256 offset, uint256 size) view returns (tuple(address vault, uint8 vaultType, bool active)[] memory)',
      target: registry,
      chain,
      params: [
        BigInt(i),
        BigInt(batchSize),
      ],
    })).output;

    // vault type: 3 = beta, 4 = production
    const activeVaultsInProdOrBeta = dynaVaults.filter(vault => vault.active && (vault.vaultType == 3 || vault.vaultType == 4));
    if (activeVaultsInProdOrBeta.length === 0) continue;
    const vaultInfos = await multiGetERC4626Infos(activeVaultsInProdOrBeta.map(vault => vault.vault), chain);

    const subResults = await Promise.all(activeVaultsInProdOrBeta.map(async (vault, index) => {
      const referenceAssetAddress = (await sdk.api.abi.call({
        abi: 'function referenceAsset() view returns (address)',
        target: vault.vault,
        chain,
      })).output;

      const referenceAssetSymbol = (await sdk.api.abi.call({
        abi: 'function symbol() view returns (string)',
        target: referenceAssetAddress,
        chain,
      })).output;

      const { tvl, apyBase, pricePerShare } = vaultInfos[index];

      const tvlUsd = referenceAssetAddress.toLowerCase() === usdc.address.toLowerCase() ? tvl : (await sdk.api.abi.call({
        abi: 'function tokenValueInQuoteAsset(address base, uint256 amount, address quote) view returns (uint256 value)',
        target: vault.vault,
        chain,
        params: [
          referenceAssetAddress,
          tvl,
          usdc.address,
        ],
      })).output;

      return {
        // Keep existing Base identifiers to preserve their yield history.
        pool: chain === 'base' ? vault.vault : `${vault.vault}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'singularity-finance',
        symbol: referenceAssetSymbol,
        tvlUsd: tvlUsd / 10 ** usdc.decimals,
        apyBase,
        ...(pricePerShare > 0 && { pricePerShare }),
        url: `https://singularityfinance.ai/vaults/${vault.vault}:${chainId}`,
        underlyingTokens: [referenceAssetAddress],
      };
    }));

    results.push(...subResults);
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
        .get(utils.getPriceApiUrl(`/block/${chain}/${time}`))
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

  // convertToAssets returns asset amounts in native decimals; scale to
  // 18-dec share units so pricePerShare is comparable across vaults.
  const allAssets = (await sdk.api.abi.multiCall({
    calls: addresses.map(a => ({ target: a })),
    abi: 'address:asset',
    chain,
  })).output.map(r => r.output);

  const allAssetDecimals = (await sdk.api.abi.multiCall({
    calls: allAssets.map(a => ({ target: a })),
    abi: 'erc20:decimals',
    chain,
  })).output.map(r => {
    const parsed = Number(r.output);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 18;
  });

  const apy = (priceNow, priceYesterday) => (priceNow / priceYesterday) ** 365 * 100 - 100;

  return await Promise.all(
    addresses.map((address, index) => ({
      pool: address,
      chain,
      tvl: allTotalAssets[index],
      apyBase: apy(allPriceNow[index], allPriceYesterday[index]),
      pricePerShare:
        (Number(allPriceNow[index]) * 10 ** (18 - allAssetDecimals[index])) /
        Number(assetUnit),
    }))
  );
};

module.exports = {
  protocolId: '6670',
  timetravel: false,
  apy: getApy,
};

