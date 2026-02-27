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
  getPerfFee: 'function getPerfFee() external view returns (uint16)',
  getManagementFee:
    'function getManagementFee() external view returns (uint16 managementFeeBps, uint32 managementFeeDays)',
  getEntryFee: 'function getEntryFee() external view returns (uint16)',
  getExitFee: 'function getExitFee() external view returns (uint16)',
  // Oracle: each vault delegates NAV to a SafeOracle updated by a keeper
  getOracle: 'function getOracle() external view returns (address)',
  // Oracle PPS in WAD (1e18) — always up-to-date, independent of settlement
  getLastSavedPricePerShare:
    'function getLastSavedPricePerShare() external view returns (uint256)',
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

/**
 * Lookback windows (days) for APY calculation.
 * Using multiple windows smooths out infrequent oracle updates:
 * if the oracle hasn't updated for several days, a single 7d window
 * would show APY=0 then spike when it updates. By blending 7/14/30d,
 * we get a stable annualized rate regardless of oracle update frequency.
 */
const LOOKBACK_DAYS = [7, 14, 30];

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
 * Calculate APY from oracle PPS change over N days.
 * Oracle PPS is in WAD (1e18). APY = (current / historical - 1) / days × 365 × 100
 */
const calcApy = (currentPps, historicalPps, days) => {
  if (!historicalPps || historicalPps <= 0 || !currentPps) return 0;
  const priceChange = (currentPps - historicalPps) / historicalPps;
  const apy = (priceChange / days) * 365 * 100;
  // Cap at reasonable bounds
  if (apy > 1000 || apy < 0) return 0;
  return apy;
};

/**
 * Compute a smoothed APY from multiple lookback windows.
 *
 * Problem: the oracle keeper updates PPS every N days (could be 1-14 days).
 * Between updates the on-chain PPS is frozen, so a single-window APY
 * oscillates between 0% (stale) and a spike (post-update).
 *
 * Solution: compute APY at each lookback (7d, 14d, 30d) and blend them
 * using inverse-days weighting (shorter = more weight for responsiveness,
 * longer = stability). Only windows where PPS actually changed are included.
 *
 * Weights: 7d → 1/7 ≈ 0.143, 14d → 1/14 ≈ 0.071, 30d → 1/30 ≈ 0.033
 * So 7d gets ~58% weight, 14d ~29%, 30d ~13% — responsive but stable.
 *
 * If only one window is valid, it's used as-is. If none, returns 0.
 */
const computeSmoothedApy = (currentPps, historicalPpsArray) => {
  if (!currentPps || currentPps <= 0) return { apyBase: 0, apyBase7d: 0 };

  // Compute APY per lookback window
  const validApys = [];
  for (let i = 0; i < LOOKBACK_DAYS.length; i++) {
    const histPps = historicalPpsArray[i];
    if (histPps && histPps > 0 && Math.abs(histPps - currentPps) > 1e-15) {
      const apy = calcApy(currentPps, histPps, LOOKBACK_DAYS[i]);
      if (apy > 0) validApys.push({ days: LOOKBACK_DAYS[i], apy });
    }
  }

  if (validApys.length === 0) return { apyBase: 0, apyBase7d: 0 };

  // Single valid window → use it directly
  if (validApys.length === 1) {
    return { apyBase: validApys[0].apy, apyBase7d: validApys[0].apy };
  }

  // Weighted average: weight = 1/days (shorter = more weight)
  let totalWeight = 0;
  let weightedSum = 0;
  for (const { days, apy } of validApys) {
    const w = 1 / days;
    totalWeight += w;
    weightedSum += apy * w;
  }
  const blendedApy = weightedSum / totalWeight;

  // apyBase7d: prefer the 7d window directly, fallback to blended
  const sevenDay = validApys.find((a) => a.days === 7);
  const apyBase7d = sevenDay ? sevenDay.apy : blendedApy;

  return { apyBase: blendedApy, apyBase7d };
};

/**
 * Discover all T3tris vaults from the factory on a given chain.
 * Also fetches each vault's oracle address for PPS lookups.
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

  // Batch-fetch vault metadata + oracle addresses
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
    oracleRes,
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
    multiCall(vaultAddresses, ABI.getOracle, chain),
  ]);

  const vaults = vaultAddresses.map((address, i) => {
    const totalAssets = totalAssetsRes.output[i];
    const totalSupply = totalSupplyRes.output[i];
    const asset = assetRes.output[i];
    const decimals = decimalsRes.output[i];
    const symbol = symbolRes.output[i];
    const name = nameRes.output[i];
    const oracle = oracleRes.output[i];

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
      oracle: oracle?.success ? oracle.output : null,
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
 * Get historical oracle PPS (Price Per Share) for APY calculation.
 * Uses getLastSavedPricePerShare() on each vault's oracle contract.
 * The oracle is updated by a keeper independently of settlements,
 * so PPS reflects current NAV even without recent settlements.
 * PPS is returned in WAD (1e18 precision).
 */
const getHistoricalOraclePps = async (vaults, chain, daysAgo) => {
  const timestamp = Math.floor(Date.now() / 1000) - DAY_SECONDS * daysAgo;
  const historicalBlock = await getBlockNumber(timestamp, chain);

  if (!historicalBlock) return {};

  // Filter vaults that have an oracle
  const vaultsWithOracle = vaults.filter((v) => v.oracle);
  if (vaultsWithOracle.length === 0) return {};

  const oracleAddresses = vaultsWithOracle.map((v) => v.oracle);

  try {
    const ppsRes = await sdk.api.abi.multiCall({
      calls: oracleAddresses.map((oracle) => ({ target: oracle })),
      abi: ABI.getLastSavedPricePerShare,
      chain,
      block: historicalBlock,
      permitFailure: true,
    });

    const result = {};
    for (let i = 0; i < vaultsWithOracle.length; i++) {
      if (ppsRes.output[i]?.success && ppsRes.output[i].output !== '0') {
        result[vaultsWithOracle[i].address] =
          Number(ppsRes.output[i].output) / 1e18;
      }
    }

    return result;
  } catch (e) {
    console.error(
      `[t3tris] Error fetching historical oracle PPS for ${chain} (${daysAgo}d ago):`,
      e.message
    );
    return {};
  }
};

/**
 * Get current oracle PPS for all vaults.
 */
const getCurrentOraclePps = async (vaults, chain) => {
  const vaultsWithOracle = vaults.filter((v) => v.oracle);
  if (vaultsWithOracle.length === 0) return {};

  const oracleAddresses = vaultsWithOracle.map((v) => v.oracle);

  try {
    const ppsRes = await sdk.api.abi.multiCall({
      calls: oracleAddresses.map((oracle) => ({ target: oracle })),
      abi: ABI.getLastSavedPricePerShare,
      chain,
      permitFailure: true,
    });

    const result = {};
    for (let i = 0; i < vaultsWithOracle.length; i++) {
      if (ppsRes.output[i]?.success && ppsRes.output[i].output !== '0') {
        result[vaultsWithOracle[i].address] =
          Number(ppsRes.output[i].output) / 1e18;
      }
    }

    return result;
  } catch (e) {
    console.error(
      `[t3tris] Error fetching current oracle PPS for ${chain}:`,
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

      // Get oracle PPS: current + historical at multiple lookback windows
      const [currentPps, ...historicalPpsArrays] = await Promise.all([
        getCurrentOraclePps(vaults, chain),
        ...LOOKBACK_DAYS.map((d) => getHistoricalOraclePps(vaults, chain, d)),
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

        // Current oracle PPS (WAD-normalized to float)
        // Falls back to totalAssets/totalSupply if oracle unavailable
        const currentSharePrice =
          currentPps[vault.address] ||
          (vault.totalSupply !== '0'
            ? Number(vault.totalAssets) / Number(vault.totalSupply)
            : 0);

        // Collect historical PPS at each lookback window for this vault
        const vaultHistoricalPps = historicalPpsArrays.map(
          (ppsMap) => ppsMap[vault.address] || 0
        );

        // Smoothed APY: weighted blend across 7d/14d/30d windows
        // This prevents spikes when oracle updates after days of silence
        const { apyBase, apyBase7d } = computeSmoothedApy(
          currentSharePrice,
          vaultHistoricalPps
        );

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
