const sdk = require('@defillama/sdk');
const utils = require('../utils');
const axios = require('axios');
const { getMerklRewardsForChain } = require('../merkl/merkl-by-identifier');

const PROJECT_NAME = 'lazy-summer-protocol';

const SUMR_TOKEN = '0x194f360D130F2393a5E9F3117A6a1B78aBEa1624';

// Factory contracts that return active FleetCommander vaults
const FACTORIES = {
  ethereum: ['0x09eb323dBFECB43fd746c607A9321dACdfB0140F'],
  base: ['0x09eb323dBFECB43fd746c607A9321dACdfB0140F'],
  arbitrum: [
    '0x09eb323dBFECB43fd746c607A9321dACdfB0140F',
    '0x7fBfb946cA4ba96559467E84ef41DA6cfE0C9a17',
  ],
  sonic: ['0xa8E4716a1e8Db9dD79f1812AF30e073d3f4Cf191'],
  hyperliquid: ['0x09eb323dBFECB43fd746c607A9321dACdfB0140F'],
};

// ABIs for ERC4626 vaults
const ABI = {
  getActiveFleetCommanders:
    'function getActiveFleetCommanders() view returns (address[])',
  totalAssets: 'function totalAssets() view returns (uint256)',
  totalSupply: 'function totalSupply() view returns (uint256)',
  asset: 'function asset() view returns (address)',
  decimals: 'function decimals() view returns (uint8)',
  symbol: 'function symbol() view returns (string)',
  name: 'function name() view returns (string)',
};

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
  } catch (e) {
    return null;
  }
};

const calcApy = (currentPrice, historicalPrice, days) => {
  if (!historicalPrice || historicalPrice <= 0 || !currentPrice) return 0;
  const priceChange = (currentPrice - historicalPrice) / historicalPrice;
  const apy = (priceChange / days) * 365 * 100;
  // Cap at reasonable APY values, floor at 0 (negative APY means loss)
  if (apy > 500 || apy < 0) return 0;
  return apy;
};

const getVaultsForChain = async (chain) => {
  const factories = FACTORIES[chain];
  if (!factories || factories.length === 0) return [];

  // Get active vaults from all factories
  const activeVaultsResults = await sdk.api.abi.multiCall({
    calls: factories.map((factory) => ({ target: factory })),
    abi: ABI.getActiveFleetCommanders,
    chain,
    permitFailure: true,
  });

  // Flatten vault addresses from all factories
  const vaultAddresses = activeVaultsResults.output
    .filter((r) => r.success && r.output)
    .flatMap((r) => r.output);

  if (vaultAddresses.length === 0) return [];

  // Get vault data in parallel
  const [
    totalAssetsRes,
    totalSupplyRes,
    assetRes,
    decimalsRes,
    symbolRes,
    nameRes,
  ] = await Promise.all([
    multiCall(vaultAddresses, ABI.totalAssets, chain),
    multiCall(vaultAddresses, ABI.totalSupply, chain),
    multiCall(vaultAddresses, ABI.asset, chain),
    multiCall(vaultAddresses, ABI.decimals, chain),
    multiCall(vaultAddresses, ABI.symbol, chain),
    multiCall(vaultAddresses, ABI.name, chain),
  ]);

  // Build vault data objects
  const vaults = vaultAddresses.map((address, i) => {
    const totalAssets = totalAssetsRes.output[i];
    const totalSupply = totalSupplyRes.output[i];
    const asset = assetRes.output[i];
    const decimals = decimalsRes.output[i];
    const symbol = symbolRes.output[i];
    const name = nameRes.output[i];

    if (
      !totalAssets.success ||
      !totalSupply.success ||
      !asset.success ||
      !decimals.success ||
      !symbol.success
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
      name: name.success ? name.output : symbol.output,
    };
  });

  return vaults.filter((v) => v !== null);
};

// Get historical share prices for APY calculation
const getHistoricalSharePrices = async (vaultAddresses, chain, daysAgo) => {
  const timestamp = Math.floor(Date.now() / 1000) - 24 * 60 * 60 * daysAgo;
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
        totalAssets.success &&
        totalSupply.success &&
        totalSupply.output !== '0'
      ) {
        sharePrices[vaultAddresses[i].toLowerCase()] =
          Number(totalAssets.output) / Number(totalSupply.output);
      }
    }

    return sharePrices;
  } catch (e) {
    console.error(
      `Error fetching historical data for ${chain} at ${daysAgo} days ago:`,
      e.message
    );
    return {};
  }
};

const main = async () => {
  const pools = [];

  for (const [chain, _] of Object.entries(FACTORIES)) {
    try {
      const vaults = await getVaultsForChain(chain);

      if (vaults.length === 0) continue;

      // Get underlying asset addresses for price lookup
      const assetAddresses = [...new Set(vaults.map((v) => v.asset))];
      const prices = await utils.getPrices(assetAddresses, chain);

      // Get historical share prices for APY calculation (1d and 7d)
      const vaultAddresses = vaults.map((v) => v.address);
      const [historicalPrices1d, historicalPrices7d, merklRewards] =
        await Promise.all([
          getHistoricalSharePrices(vaultAddresses, chain, 1),
          getHistoricalSharePrices(vaultAddresses, chain, 7),
          getMerklRewardsForChain(vaultAddresses, chain, {
            defaultRewardToken: SUMR_TOKEN,
          }),
        ]);

      for (const vault of vaults) {
        const price = prices.pricesByAddress[vault.asset];
        if (!price) continue;

        // Calculate TVL
        const totalAssetsNormalized =
          Number(vault.totalAssets) / 10 ** vault.decimals;
        const tvlUsd = totalAssetsNormalized * price;

        // Skip vaults with negligible TVL
        if (tvlUsd < 100) continue;

        // Calculate current share price
        const currentSharePrice =
          vault.totalSupply !== '0'
            ? Number(vault.totalAssets) / Number(vault.totalSupply)
            : 0;

        // Calculate APY from share price change (1d for base, 7d for apyBase7d)
        const historicalPrice1d = historicalPrices1d[vault.address];
        const historicalPrice7d = historicalPrices7d[vault.address];
        const apyBase = calcApy(currentSharePrice, historicalPrice1d, 1);
        const apyBase7d = calcApy(currentSharePrice, historicalPrice7d, 7);

        // Extract base symbol from vault symbol (e.g., LVUSDC-LR -> USDC)
        let baseSymbol = vault.symbol;
        if (baseSymbol.startsWith('LV')) {
          baseSymbol = baseSymbol.substring(2);
        }
        // Remove risk tier suffix if present
        baseSymbol = baseSymbol.replace(/-LR$|-HR$/, '');

        // Format poolMeta: remove LazyVault prefix, replace underscores, add space before Risk
        const poolMeta = vault.name
          .replace(/^LazyVault_/, '')
          .replace(/_/g, ' ')
          .replace(/([a-z])Risk/gi, '$1 Risk');

        const poolData = {
          pool: `${vault.address}-${chain}`.toLowerCase(),
          chain: utils.formatChain(chain),
          project: PROJECT_NAME,
          symbol: utils.formatSymbol(baseSymbol),
          tvlUsd,
          apyBase,
          apyBase7d,
          underlyingTokens: [vault.asset],
          poolMeta,
          url: `https://summer.fi/earn/${chain === 'ethereum' ? 'mainnet' : chain}/position/${vault.address}`,
        };

        // Add Merkl rewards if available (SUMR token incentives)
        const vaultRewards = merklRewards[vault.address];
        if (vaultRewards && vaultRewards.apyReward > 0) {
          poolData.apyReward = vaultRewards.apyReward;
          poolData.rewardTokens = vaultRewards.rewardTokens;
        }

        pools.push(poolData);
      }
    } catch (error) {
      console.error(`Error fetching data for ${chain}:`, error.message);
    }
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://summer.fi/earn',
};
