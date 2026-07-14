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

// Supported chains: DefiLlama chain name -> ecosystem-API chainId. Vaults share
// the same CREATE3 addresses on every EVM chain, so adding a chain here surfaces
// its vaults as soon as the ecosystem API returns verified entries for it.
const CHAIN_IDS = { arbitrum: 42161, robinhood: 4663 };
const CHAINS = Object.keys(CHAIN_IDS);

// A few chains' @defillama/sdk provider key differs from the DefiLlama slug we
// use for the DB/URL: map slug -> sdk chain for on-chain calls (Robinhood's
// provider is registered as "robinhoodchain", chainId 4663).
const SDK_CHAIN = { robinhood: 'robinhoodchain' };
const sdkChain = (chain) => SDK_CHAIN[chain] || chain;

const DAY_SECONDS = 24 * 3600;

// Single lookback window (days) for the APY calculation, applied relative to
// each vault's last NAV (see getAnchoredHistoricalPps). A fixed window keeps the
// reported rate consistent across all vaults.
const APY_WINDOW_DAYS = 7;

const multiCall = (targets, abi, chain, block = undefined) =>
  sdk.api.abi.multiCall({
    calls: targets.map((target) => ({ target })),
    abi,
    chain: sdkChain(chain),
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
 * Single-window APY from oracle PPS change over `days`.
 * Oracle PPS is in WAD (1e18). APY = (current / historical - 1) / days × 365 × 100.
 * Returns 0 for missing data, loss periods, or implausible spikes.
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
 * Historical oracle PPS for the single APY window, anchored at each vault's
 * LAST NAV update (lastValuationTimestamp) rather than `now`.
 *
 * Why anchor at the last NAV: the oracle PPS only moves on a NAV update and is
 * flat in between. Anchoring both ends of the window at the last NAV (current
 * PPS is the value saved at that NAV; historical PPS is read APY_WINDOW_DAYS
 * before it) means the computed rate is the one realized at that NAV and stays
 * constant until the next NAV, instead of decaying toward zero as flat days
 * accumulate.
 *
 * Returns { vaultAddr: historicalPps } — the PPS APY_WINDOW_DAYS before the
 * anchor.
 */
const getAnchoredHistoricalPps = async (vaults, chain) => {
  const withOracle = vaults.filter((v) => v.oracle);
  if (withOracle.length === 0) return {};

  const nowSec = Math.floor(Date.now() / 1000);

  // One task per vault, anchored APY_WINDOW_DAYS before the vault's last NAV.
  const tasks = withOracle.map((v) => {
    const anchor =
      v.lastValuationTimestamp > 0 ? v.lastValuationTimestamp : nowSec;
    return {
      vaultAddr: v.address,
      oracle: v.oracle,
      ts: anchor - DAY_SECONDS * APY_WINDOW_DAYS,
    };
  });

  // Resolve unique timestamps to blocks once.
  const uniqueTs = [...new Set(tasks.map((t) => t.ts))];
  const blockByTs = {};
  await Promise.all(
    uniqueTs.map(async (ts) => {
      blockByTs[ts] = await getBlockNumber(ts, sdkChain(chain));
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

  await Promise.all(
    Object.entries(byBlock).map(async ([block, items]) => {
      try {
        // Fetch oracle PPS at this historical block.
        const ppsRes = await sdk.api.abi.multiCall({
          calls: items.map((it) => ({ target: it.oracle })),
          abi: ABI.getLastSavedPricePerShare,
          chain: sdkChain(chain),
          block: Number(block),
          permitFailure: true,
        });
        items.forEach((it, i) => {
          const ppsO = ppsRes.output[i];
          if (ppsO?.success && ppsO.output !== '0') {
            result[it.vaultAddr] = toDecimal(ppsO.output, 18);
          }
        });
      } catch (e) {
        // Leave missing; calcApy treats a missing historical PPS as 0 APY.
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
      chain: sdkChain(chain),
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
      const prices = await utils.getPrices(assetAddresses, sdkChain(chain));

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

        // Historical oracle PPS for the single window, anchored at last NAV.
        const historicalPps = anchoredHist[vault.address] || 0;

        // Single-window APY (APY_WINDOW_DAYS), consistent across all vaults.
        const apyBase = calcApy(
          currentSharePrice,
          historicalPps,
          APY_WINDOW_DAYS,
        );

        // Fee metadata: performance fee, plus management fee when non-zero.
        const poolMeta =
          vault.mgmtFeePct > 0
            ? `perf ${vault.perfFeePct.toFixed(1)}%, mgmt ${vault.mgmtFeePct.toFixed(
                1,
              )}%`
            : `perf ${vault.perfFeePct.toFixed(1)}%`;

        pools.push({
          pool: `${vault.address}-${chain}`.toLowerCase(),
          chain: utils.formatChain(chain),
          project: PROJECT_NAME,
          symbol: vault.symbol,
          tvlUsd,
          apyBase,
          apyBase7d: apyBase,
          underlyingTokens: [vault.asset],
          poolMeta,
          // Oracle PPS: the authoritative share price that only moves on NAV
          // updates. Using totalAssets/totalSupply would drop on deposit settlement
          // (supply doubles before totalAssets is revalued), causing false negative
          // fees in the DefiLlama fee test.
          pricePerShare: currentSharePrice > 0 ? currentSharePrice : undefined,
          url: `https://app.t3tris.finance/vaults/${CHAIN_IDS[chain]}/${vault.address}`,
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
  protocolId: '8068',
  timetravel: false,
  apy: main,
  url: 'https://t3tris.finance/',
};
