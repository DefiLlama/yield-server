const sdk = require('@defillama/sdk');
const utils = require('../utils');
const axios = require('axios');

const PROJECT_NAME = 't3tris-finance';

// T3tris protocol factory — deterministic CREATE3 address, same on all chains
const T3TRIS_FACTORY = '0x7DD63c4eE5CD277B7870155371a6d62A2f7b1652';

// ABIs for the T3tris protocol
const ABI = {
  getDeployedVaultsCount:
    'function getDeployedVaultsCount() external view returns (uint256)',
  getDeployedVaults:
    'function getDeployedVaults(uint256 fromIndex, uint256 toIndex) external view returns (address[])',
  totalAssets: 'function totalAssets() view returns (uint256)',
  totalSupply: 'function totalSupply() view returns (uint256)',
  asset: 'function asset() view returns (address)',
  decimals: 'function decimals() view returns (uint8)',
  symbol: 'function symbol() view returns (string)',
  name: 'function name() view returns (string)',
  convertToAssets:
    'function convertToAssets(uint256 shares) view returns (uint256)',
  getPerfFee: 'function getPerfFee() external view returns (uint16)',
  getManagementFee:
    'function getManagementFee() external view returns (uint16 managementFeeBps, uint32 managementFeeDays)',
  getEntryFee: 'function getEntryFee() external view returns (uint16)',
  getExitFee: 'function getExitFee() external view returns (uint16)',
  isVaultOpen: 'function isVaultOpen() external view returns (bool)',
};

// Chains where T3tris will be deployed
const CHAINS = [
  'ethereum',
  'arbitrum',
  'base',
  'optimism',
  'polygon',
  'avax',
  'bsc',
  'linea',
  'scroll',
  'blast',
  'mantle',
  'mode',
  'xdai',
  'fantom',
  'sonic',
];

const DAY_SECONDS = 24 * 3600;

const multiCall = (targets, abi, chain, block = undefined) =>
  sdk.api.abi.multiCall({
    calls: targets.map((target) => ({ target })),
    abi,
    chain,
    block,
    permitFailure: true,
  });

const getBlockNumber = async (timestamp, chain) => {
  try {
    const response = await axios.get(
      `https://coins.llama.fi/block/${chain}/${timestamp}`
    );
    return response.data.height;
  } catch {
    return null;
  }
};

/**
 * Calculate APY from share price change over N days.
 * APY = (currentPrice / historicalPrice - 1) / days * 365 * 100
 */
const calcApy = (currentPrice, historicalPrice, days) => {
  if (!historicalPrice || historicalPrice <= 0 || !currentPrice) return 0;
  const priceChange = (currentPrice - historicalPrice) / historicalPrice;
  const apy = (priceChange / days) * 365 * 100;
  // Cap at reasonable bounds
  if (apy > 1000 || apy < 0) return 0;
  return apy;
};

/**
 * Discover all T3tris vaults from the factory on a given chain.
 */
const getVaultsForChain = async (chain) => {
  let count;
  try {
    const countResult = await sdk.api.abi.call({
      target: T3TRIS_FACTORY,
      abi: ABI.getDeployedVaultsCount,
      chain,
    });
    count = Number(countResult.output);
  } catch {
    // Factory not deployed on this chain yet
    return [];
  }

  if (count === 0) return [];

  const vaultsResult = await sdk.api.abi.call({
    target: T3TRIS_FACTORY,
    abi: ABI.getDeployedVaults,
    params: [0, count - 1],
    chain,
  });

  const vaultAddresses = vaultsResult.output;
  if (!vaultAddresses || vaultAddresses.length === 0) return [];

  // Batch-fetch vault metadata
  const [
    totalAssetsRes,
    totalSupplyRes,
    assetRes,
    decimalsRes,
    symbolRes,
    nameRes,
    perfFeeRes,
    mgmtFeeRes,
    entryFeeRes,
    exitFeeRes,
  ] = await Promise.all([
    multiCall(vaultAddresses, ABI.totalAssets, chain),
    multiCall(vaultAddresses, ABI.totalSupply, chain),
    multiCall(vaultAddresses, ABI.asset, chain),
    multiCall(vaultAddresses, ABI.decimals, chain),
    multiCall(vaultAddresses, ABI.symbol, chain),
    multiCall(vaultAddresses, ABI.name, chain),
    multiCall(vaultAddresses, ABI.getPerfFee, chain),
    multiCall(vaultAddresses, ABI.getManagementFee, chain),
    multiCall(vaultAddresses, ABI.getEntryFee, chain),
    multiCall(vaultAddresses, ABI.getExitFee, chain),
  ]);

  const vaults = vaultAddresses.map((address, i) => {
    const totalAssets = totalAssetsRes.output[i];
    const totalSupply = totalSupplyRes.output[i];
    const asset = assetRes.output[i];
    const decimals = decimalsRes.output[i];
    const symbol = symbolRes.output[i];
    const name = nameRes.output[i];

    if (
      !totalAssets?.success ||
      !totalSupply?.success ||
      !asset?.success ||
      !decimals?.success ||
      !symbol?.success
    ) {
      return null;
    }

    return {
      address: address.toLowerCase(),
      totalAssets: totalAssets.output,
      totalSupply: totalSupply.output,
      asset: asset.output.toLowerCase(),
      decimals: Number(decimals.output),
      symbol: symbol.output,
      name: name?.success ? name.output : symbol.output,
      perfFeeBps: perfFeeRes.output[i]?.success
        ? Number(perfFeeRes.output[i].output)
        : 0,
      mgmtFeeBps:
        mgmtFeeRes.output[i]?.success
          ? Number(mgmtFeeRes.output[i].output.managementFeeBps || mgmtFeeRes.output[i].output[0] || 0)
          : 0,
      mgmtFeeDays:
        mgmtFeeRes.output[i]?.success
          ? Number(mgmtFeeRes.output[i].output.managementFeeDays || mgmtFeeRes.output[i].output[1] || 365)
          : 365,
      entryFeeBps: entryFeeRes.output[i]?.success
        ? Number(entryFeeRes.output[i].output)
        : 0,
      exitFeeBps: exitFeeRes.output[i]?.success
        ? Number(exitFeeRes.output[i].output)
        : 0,
    };
  });

  return vaults.filter((v) => v !== null);
};

/**
 * Get historical share prices (totalAssets/totalSupply) for APY calculation.
 */
const getHistoricalSharePrices = async (vaultAddresses, chain, daysAgo) => {
  const timestamp = Math.floor(Date.now() / 1000) - DAY_SECONDS * daysAgo;
  const historicalBlock = await getBlockNumber(timestamp, chain);

  if (!historicalBlock) return {};

  try {
    const [totalAssetsRes, totalSupplyRes] = await Promise.all([
      multiCall(vaultAddresses, ABI.totalAssets, chain, historicalBlock),
      multiCall(vaultAddresses, ABI.totalSupply, chain, historicalBlock),
    ]);

    const sharePrices = {};
    for (let i = 0; i < vaultAddresses.length; i++) {
      const totalAssets = totalAssetsRes.output[i];
      const totalSupply = totalSupplyRes.output[i];

      if (
        totalAssets?.success &&
        totalSupply?.success &&
        totalSupply.output !== '0'
      ) {
        sharePrices[vaultAddresses[i].toLowerCase()] =
          Number(totalAssets.output) / Number(totalSupply.output);
      }
    }

    return sharePrices;
  } catch (e) {
    console.error(
      `[t3tris] Error fetching historical data for ${chain} (${daysAgo}d ago):`,
      e.message
    );
    return {};
  }
};

const main = async () => {
  const pools = [];

  for (const chain of CHAINS) {
    try {
      const vaults = await getVaultsForChain(chain);

      if (vaults.length === 0) continue;

      // Get prices for underlying assets
      const assetAddresses = [...new Set(vaults.map((v) => v.asset))];
      const prices = await utils.getPrices(assetAddresses, chain);

      // Get historical share prices for APY (1d and 7d)
      const vaultAddresses = vaults.map((v) => v.address);
      const [historicalPrices1d, historicalPrices7d] = await Promise.all([
        getHistoricalSharePrices(vaultAddresses, chain, 1),
        getHistoricalSharePrices(vaultAddresses, chain, 7),
      ]);

      for (const vault of vaults) {
        const price = prices.pricesByAddress[vault.asset];
        if (!price) continue;

        // Calculate TVL in USD
        const totalAssetsNormalized =
          Number(vault.totalAssets) / 10 ** vault.decimals;
        const tvlUsd = totalAssetsNormalized * price;

        // Skip negligible vaults
        if (tvlUsd < 100) continue;

        // Current share price: totalAssets / totalSupply
        const currentSharePrice =
          vault.totalSupply !== '0'
            ? Number(vault.totalAssets) / Number(vault.totalSupply)
            : 0;

        // APY from share price growth
        const historicalPrice1d = historicalPrices1d[vault.address];
        const historicalPrice7d = historicalPrices7d[vault.address];
        const apyBase = calcApy(currentSharePrice, historicalPrice1d, 1);
        const apyBase7d = calcApy(currentSharePrice, historicalPrice7d, 7);

        // Build fee metadata string
        const feeParts = [];
        if (vault.perfFeeBps > 0)
          feeParts.push(`Perf: ${(vault.perfFeeBps / 100).toFixed(1)}%`);
        if (vault.mgmtFeeBps > 0)
          feeParts.push(`Mgmt: ${(vault.mgmtFeeBps / 100).toFixed(1)}%`);
        if (vault.entryFeeBps > 0)
          feeParts.push(`Entry: ${(vault.entryFeeBps / 100).toFixed(2)}%`);
        if (vault.exitFeeBps > 0)
          feeParts.push(`Exit: ${(vault.exitFeeBps / 100).toFixed(2)}%`);
        const poolMeta = feeParts.length > 0 ? feeParts.join(' | ') : undefined;

        pools.push({
          pool: `${vault.address}-${chain}`.toLowerCase(),
          chain: utils.formatChain(chain),
          project: PROJECT_NAME,
          symbol: utils.formatSymbol(vault.symbol),
          tvlUsd,
          apyBase,
          apyBase7d,
          underlyingTokens: [vault.asset],
          poolMeta,
          url: `https://app.t3tris.finance/vault/${vault.address}`,
        });
      }
    } catch (error) {
      console.error(
        `[t3tris] Error fetching data for ${chain}:`,
        error.message
      );
    }
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.t3tris.finance',
};
