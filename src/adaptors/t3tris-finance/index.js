const sdk = require('@defillama/sdk');
const utils = require('../utils');
const axios = require('axios');

const PROJECT_NAME = 't3tris-finance';

// T3tris ecosystem API — authoritative list of vaults with curation flags.
// Only vaults that are `verified`, not `blacklisted`, and not `public: false`
// are indexed.
const VAULTS_API = 'https://ecosystem.t3tris.finance/vaults';

// ABIs for the T3tris vaults
const ABI = {
  totalAssets: 'function totalAssets() view returns (uint256)',
  totalSupply: 'function totalSupply() view returns (uint256)',
  asset: 'function asset() view returns (address)',
  decimals: 'function decimals() view returns (uint8)',
  symbol: 'function symbol() view returns (string)',
  name: 'function name() view returns (string)',
  getPerformanceFee: 'function getPerformanceFee() external view returns (uint64)',
  getManagementFee:
    'function getManagementFee() external view returns (uint64 managementFeeWad, uint32 managementFeeDays)',
  getEntryFee: 'function getEntryFee() external view returns (uint64)',
  getExitFee: 'function getExitFee() external view returns (uint64)',
  // Oracle: each vault delegates NAV to a SafeOracle updated by a keeper
  getOracle: 'function getOracle() external view returns (address)',
  // Oracle PPS in WAD (1e18) — always up-to-date, independent of settlement
  getLastSavedPricePerShare:
    'function getLastSavedPricePerShare() external view returns (uint256)',
  // Timestamp of the oracle's last NAV update (setTotalAssets). Used to anchor
  // the APY lookback windows at the last NAV so the rate is extrapolated.
  lastValuationTimestamp:
    'function lastValuationTimestamp() external view returns (uint64)',
};

// Supported chains: DefiLlama chain name -> ecosystem-API chainId. Arbitrum only
// for now (same CREATE3 addresses on every EVM chain); add a chain here once it
// goes live and the API returns verified vaults for it.
const CHAIN_IDS = { arbitrum: 42161 };
const CHAINS = Object.keys(CHAIN_IDS);

const DAY_SECONDS = 24 * 3600;

/**
 * Lookback windows (days) for APY calculation, applied relative to each vault's
 * last NAV (see getAnchoredHistoricalPps). Multiple windows smooth out the
 * realized rate; the short windows (1/3d) also let freshly-launched vaults —
 * whose history does not yet reach 7+ days before their last NAV — still report
 * an APY instead of falling back to zero.
 */
const LOOKBACK_DAYS = [1, 3, 7, 14, 30];

const multiCall = (targets, abi, chain, block = undefined) =>
  sdk.api.abi.multiCall({
    calls: targets.map((target) => ({ target })),
    abi,
    chain,
    block,
    permitFailure: true,
  });

// Convert a raw on-chain integer (string/BigInt) to a JS float scaled by
// `decimals`, without the precision loss of Number(BigInt) on large values
// (vault/PPS magnitudes routinely exceed Number.MAX_SAFE_INTEGER).
const toDecimal = (raw, decimals) => {
  if (raw === undefined || raw === null) return 0;
  const v = BigInt(raw.toString());
  const base = 10n ** BigInt(decimals);
  return Number(v / base) + Number(v % base) / 10 ** Number(decimals);
};

// Ratio of two raw on-chain integers as a float, computed in BigInt space.
const ratio1e18 = (numRaw, denRaw) => {
  const den = BigInt(denRaw.toString());
  if (den === 0n) return 0;
  return Number((BigInt(numRaw.toString()) * 10n ** 18n) / den) / 1e18;
};

const getBlockNumber = async (timestamp, chain) => {
  try {
    const response = await axios.get(
      `https://coins.llama.fi/block/${chain}/${timestamp}`,
      { timeout: 10000 },
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
 * Discover verified, non-blacklisted, public T3tris vaults for a chain from the
 * ecosystem API, then fetch each vault's metadata + oracle address on-chain.
 */
const getVaultsForChain = async (chain) => {
  // Discover verified, non-blacklisted, public vaults from the T3tris ecosystem
  // API. A vault must be verified, not blacklisted, not `public: false`, on this
  // chain, and carry a usable address/asset.
  let vaultAddresses;
  try {
    const { data } = await axios.get(VAULTS_API, { timeout: 10000 });
    const chainId = CHAIN_IDS[chain];
    vaultAddresses = (data || [])
      .filter(
        (v) =>
          v?.verified &&
          !v?.blacklisted &&
          v?.public !== false &&
          Number(v?.chainId) === chainId &&
          typeof v?.address === 'string' &&
          v.address &&
          typeof v?.asset === 'string' &&
          v.asset,
      )
      .map((v) => v.address);
  } catch {
    // API unreachable
    return [];
  }

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
    multiCall(vaultAddresses, ABI.getPerformanceFee, chain),
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
      // Fees are WAD (1e18 = 100%); store as percentage (wad / 1e16)
      perfFeePct: perfFeeRes.output[i]?.success
        ? Number(perfFeeRes.output[i].output) / 1e16
        : 0,
      mgmtFeePct: mgmtFeeRes.output[i]?.success
        ? Number(
            mgmtFeeRes.output[i].output.managementFeeWad ||
              mgmtFeeRes.output[i].output[0] ||
              0,
          ) / 1e16
        : 0,
      mgmtFeeDays: mgmtFeeRes.output[i]?.success
        ? Number(
            mgmtFeeRes.output[i].output.managementFeeDays ||
              mgmtFeeRes.output[i].output[1] ||
              365,
          )
        : 365,
      entryFeePct: entryFeeRes.output[i]?.success
        ? Number(entryFeeRes.output[i].output) / 1e16
        : 0,
      exitFeePct: exitFeeRes.output[i]?.success
        ? Number(exitFeeRes.output[i].output) / 1e16
        : 0,
    };
  });

  const vaultsList = vaults.filter((v) => v !== null);

  // Fetch each oracle's last NAV timestamp (setTotalAssets). The APY windows are
  // anchored at this timestamp so the rate is held (extrapolated) until the next
  // NAV instead of decaying as flat days accumulate.
  const oracleVaults = vaultsList.filter((v) => v.oracle);
  if (oracleVaults.length > 0) {
    const lvtRes = await multiCall(
      oracleVaults.map((v) => v.oracle),
      ABI.lastValuationTimestamp,
      chain,
    );
    oracleVaults.forEach((v, i) => {
      const out = lvtRes.output[i];
      v.lastValuationTimestamp = out?.success ? Number(out.output) : 0;
    });
  }
  vaultsList.forEach((v) => {
    if (v.lastValuationTimestamp === undefined) v.lastValuationTimestamp = 0;
  });

  return vaultsList;
};

/**
 * Historical oracle PPS for the APY windows, anchored at each vault's LAST NAV
 * update (lastValuationTimestamp) rather than `now`.
 *
 * Why: the oracle PPS only moves on a NAV update and is flat in between. If we
 * anchored the lookback at `now`, then once a vault stops updating the trailing
 * window would keep absorbing flat days and the APY would steadily decay toward
 * zero. By anchoring both ends of every window at the last NAV (current PPS is
 * the value saved at that NAV; historical PPS is read N days before it), the
 * computed rate is the one realized at the last NAV and stays constant until the
 * next NAV — i.e. it is extrapolated forward to now.
 *
 * Returns { vaultAddr: [pps@(tLast-7d), pps@(tLast-14d), pps@(tLast-30d)] }.
 */
const getAnchoredHistoricalPps = async (vaults, chain) => {
  const withOracle = vaults.filter((v) => v.oracle);
  if (withOracle.length === 0) return {};

  const nowSec = Math.floor(Date.now() / 1000);

  // One (vault, window) task per lookback, anchored at the vault's last NAV.
  const tasks = [];
  for (const v of withOracle) {
    const anchor =
      v.lastValuationTimestamp > 0 ? v.lastValuationTimestamp : nowSec;
    LOOKBACK_DAYS.forEach((d, wIndex) => {
      tasks.push({
        vaultAddr: v.address,
        oracle: v.oracle,
        wIndex,
        ts: anchor - DAY_SECONDS * d,
      });
    });
  }

  // Resolve unique timestamps to blocks once.
  const uniqueTs = [...new Set(tasks.map((t) => t.ts))];
  const blockByTs = {};
  await Promise.all(
    uniqueTs.map(async (ts) => {
      blockByTs[ts] = await getBlockNumber(ts, chain);
    }),
  );

  // Group tasks by historical block and batch the oracle reads per block.
  const byBlock = {};
  for (const t of tasks) {
    const block = blockByTs[t.ts];
    if (!block) continue;
    (byBlock[block] = byBlock[block] || []).push(t);
  }

  const result = {};
  withOracle.forEach((v) => {
    result[v.address] = new Array(LOOKBACK_DAYS.length).fill(0);
  });

  await Promise.all(
    Object.entries(byBlock).map(async ([block, items]) => {
      try {
        const ppsRes = await sdk.api.abi.multiCall({
          calls: items.map((it) => ({ target: it.oracle })),
          abi: ABI.getLastSavedPricePerShare,
          chain,
          block: Number(block),
          permitFailure: true,
        });
        items.forEach((it, i) => {
          const o = ppsRes.output[i];
          if (o?.success && o.output !== '0') {
            result[it.vaultAddr][it.wIndex] = toDecimal(o.output, 18);
          }
        });
      } catch (e) {
        // Leave these windows at 0; computeSmoothedApy ignores empty windows.
      }
    }),
  );

  return result;
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
        result[vaultsWithOracle[i].address] = toDecimal(
          ppsRes.output[i].output,
          18,
        );
      }
    }

    return result;
  } catch (e) {
    console.error(
      `[t3tris] Error fetching current oracle PPS for ${chain}:`,
      e.message,
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

      // Current PPS (= value saved at the last NAV) + historical PPS anchored at
      // each vault's last NAV, so the APY is held (extrapolated) afterwards.
      const [currentPps, anchoredHist] = await Promise.all([
        getCurrentOraclePps(vaults, chain),
        getAnchoredHistoricalPps(vaults, chain),
      ]);

      for (const vault of vaults) {
        const price = prices.pricesByAddress[vault.asset];
        if (!price) continue;

        // Calculate TVL in USD
        const totalAssetsNormalized = toDecimal(
          vault.totalAssets,
          vault.decimals,
        );
        const tvlUsd = totalAssetsNormalized * price;

        // Skip negligible vaults
        if (tvlUsd < 100) continue;

        // Current oracle PPS (WAD-normalized to float)
        // Falls back to totalAssets/totalSupply if oracle unavailable
        const currentSharePrice =
          currentPps[vault.address] ||
          (vault.totalSupply !== '0'
            ? ratio1e18(vault.totalAssets, vault.totalSupply)
            : 0);

        // Historical PPS for this vault, anchored at its last NAV update.
        const vaultHistoricalPps = anchoredHist[vault.address] || [];

        // Smoothed APY: weighted blend across 7d/14d/30d windows
        // This prevents spikes when oracle updates after days of silence
        const { apyBase, apyBase7d } = computeSmoothedApy(
          currentSharePrice,
          vaultHistoricalPps,
        );

        // Build fee metadata string
        const feeParts = [];
        if (vault.perfFeePct > 0)
          feeParts.push(`Perf: ${vault.perfFeePct.toFixed(1)}%`);
        if (vault.mgmtFeePct > 0)
          feeParts.push(`Mgmt: ${vault.mgmtFeePct.toFixed(1)}%`);
        if (vault.entryFeePct > 0)
          feeParts.push(`Entry: ${vault.entryFeePct.toFixed(2)}%`);
        if (vault.exitFeePct > 0)
          feeParts.push(`Exit: ${vault.exitFeePct.toFixed(2)}%`);
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
        error.message,
      );
    }
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://t3tris.finance/',
};
