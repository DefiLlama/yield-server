const axios = require("axios");
const utils = require("../utils");
const { ethers } = require("ethers");

const ETHEREUM_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmfgjrwjojbpm01x2dfgte8tr/subgraphs/sir-ethereum-subgraph-1/2.0.3/gn";
const HYPER_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmfgjrwjojbpm01x2dfgte8tr/subgraphs/sir-hyperevm-subgraph-1/2.0.3/gn";

const ETHEREUM_SIR =
  "0x4Da4fb565Dcd5D5C5dB495205c109bA983A8ABa2".toLowerCase();
const HYPER_SIR =
  "0xA06D0c5a8ADb7134903CA13D1FC0641731E2B766".toLowerCase();

// SIR token decimals
const SIR_DECIMALS = 12;

// 30 day lookback for fee compounding
const DAYS_LOOKBACK = 30;
const SECONDS_IN_DAY = 24 * 60 * 60;
const LOOKBACK_SECONDS = DAYS_LOOKBACK * SECONDS_IN_DAY;
const SECONDS_IN_YEAR = 365 * SECONDS_IN_DAY;

// Uniswap V3 / HyperSwap V3 pool ABI (minimal for slot0)
const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
];

// Uniswap V3 Factory ABI for getPool
const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
];

// Two chains, two subgraphs
const CHAIN_CONFIGS = [
  {
    key: "ethereum",
    priceKey: "ethereum", // DefiLlama price chain slug
    chain: "Ethereum",
    subgraphUrl: ETHEREUM_SUBGRAPH_URL,
    sirAddress: ETHEREUM_SIR,
    urlPrefix: "https://app.sir.trading/liquidity?vault=",
    // DEX config for SIR price
    rpcUrl: "https://eth.llamarpc.com",
    dexFactory: "0x1F98431c8aD98523631AE4a59f267346ea31F984", // Uniswap V3 Factory
    nativeWrapped: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    nativeDecimals: 18,
    dexFeeTier: 10000, // 1% fee tier
  },
  {
    key: "hyperliquid-l1",
    priceKey: "Hyperliquid", // DefiLlama price chain slug
    chain: "Hyperliquid L1",
    subgraphUrl: HYPER_SUBGRAPH_URL,
    sirAddress: HYPER_SIR,
    urlPrefix: "https://hype.sir.trading/liquidity?vault=",
    // DEX config for SIR price
    rpcUrl: "https://rpc.hyperliquid.xyz/evm",
    dexFactory: "0xB1c0fa0B789320044A6F623cFe5eBda9562602E3", // HyperSwap V3 Factory
    nativeWrapped: "0x5555555555555555555555555555555555555555", // WHYPE
    nativeDecimals: 18,
    dexFeeTier: 10000, // 1% fee tier
  },
];

// Helpers
async function querySubgraph(subgraphUrl, query, variables = {}) {
  const res = await axios.post(subgraphUrl, {
    query,
    variables,
  });
  if (res.data.errors) {
    throw new Error(JSON.stringify(res.data.errors));
  }
  return res.data.data;
}

/**
 * Fetch SIR price in native token (ETH/HYPE) from DEX (Uniswap V3 / HyperSwap V3)
 * Returns SIR price in native token units
 */
async function fetchSirPriceFromDex(chainCfg) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(chainCfg.rpcUrl);

    const factory = new ethers.Contract(
      chainCfg.dexFactory,
      FACTORY_ABI,
      provider
    );

    // Get pool address for SIR/Native pair
    const poolAddress = await factory.getPool(
      chainCfg.sirAddress,
      chainCfg.nativeWrapped,
      chainCfg.dexFeeTier
    );

    if (
      !poolAddress ||
      poolAddress === "0x0000000000000000000000000000000000000000"
    ) {
      console.log(`No DEX pool found for SIR on ${chainCfg.chain}`);
      return 0;
    }

    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);

    // Get token order and slot0
    const [token0, slot0] = await Promise.all([pool.token0(), pool.slot0()]);

    const sqrtPriceX96 = slot0.sqrtPriceX96;
    const Q96 = ethers.BigNumber.from(2).pow(96);

    // Calculate price from sqrtPriceX96
    // price = (sqrtPriceX96 / 2^96)^2
    // This gives token1/token0 ratio in raw terms
    const sqrtPriceX96Num = Number(sqrtPriceX96.toString());
    const Q96Num = Number(Q96.toString());
    const rawPrice = Math.pow(sqrtPriceX96Num / Q96Num, 2);

    const sirIsToken0 =
      token0.toLowerCase() === chainCfg.sirAddress.toLowerCase();

    // Adjust for decimals: price * 10^(token0Decimals - token1Decimals)
    let nativePerSir;
    if (sirIsToken0) {
      // rawPrice = native/SIR in raw terms
      // Adjust: native per SIR = rawPrice * 10^(SIR_DECIMALS - nativeDecimals)
      nativePerSir = rawPrice * Math.pow(10, SIR_DECIMALS - chainCfg.nativeDecimals);
    } else {
      // rawPrice = SIR/native in raw terms
      // We need native/SIR, so invert: 1/rawPrice
      // Adjust: native per SIR = (1/rawPrice) * 10^(SIR_DECIMALS - nativeDecimals)
      nativePerSir = (1 / rawPrice) * Math.pow(10, SIR_DECIMALS - chainCfg.nativeDecimals);
    }

    return nativePerSir;
  } catch (error) {
    console.log(`Error fetching SIR price from DEX on ${chainCfg.chain}:`, error.message);
    return 0;
  }
}

/**
 * Fetch all active vaults for a given chain.
 *   Vault.exists
 *   Vault.collateralToken { id, symbol, decimals }
 *   Vault.lockedLiquidity
 *   Vault.teaSupply
 *   Vault.reserveLPers
 *   Vault.rate
 */
async function fetchVaultsForChain(chainCfg) {
  const query = `
    query getVaults {
      vaults(where: { exists: true }) {
        id
        collateralToken {
          id
          symbol
          decimals
        }
        debtToken {
          symbol
        }
        leverageTier
        lockedLiquidity
        teaSupply
        reserveLPers
        rate
      }
    }
  `;

  const { vaults } = await querySubgraph(chainCfg.subgraphUrl, query);
  return vaults || [];
}

/**
 * Fetch fee events for a vault in the last 1 day for a given chain.
 */
async function fetchFeesForVault(chainCfg, vaultId, timestampThreshold) {
  const query = `
    query getVaultFees($vaultId: Bytes!, $timestampThreshold: BigInt!) {
      fees(
        where: {
          vaultId: $vaultId
          timestamp_gte: $timestampThreshold
        }
      ) {
        lpApy
        timestamp
      }
    }
  `;

  const { fees } = await querySubgraph(
    chainCfg.subgraphUrl,
    query,
    {
      vaultId,
      timestampThreshold: String(timestampThreshold),
    }
  );

  return fees || [];
}

/**
 * Fees APY: compound lpApy over last 1 day and annualize.
 */
function computeFeesApy(fees) {
  if (!fees || fees.length === 0) {
    return 0;
  }

  const compoundReturn = fees.reduce((prod, fee) => {
    const lpApy = Number(fee.lpApy) || 0;
    return prod * (1 + lpApy);
  }, 1);

  if (compoundReturn <= 0) {
    return 0;
  }

  const annualized =
    Math.pow(compoundReturn, 365 / DAYS_LOOKBACK) - 1;

  return annualized * 100;
}

/**
 * Compute SIR rewards APY from vault fields.
 * - rate is scaled by 1e12 and per second
 * - reserveLPers and collateralToken.decimals give LP collateral
 * - POL is excluded via externalLpRatio
 * The SIR address is chain specific and passed in.
 */
function computeSirRewardsApy(vault, sirPriceInCollateral, sirAddress) {
  const ratePerSecond = Number(vault.rate || 0) / 1e12;
  if (!ratePerSecond) return 0;

  const annualSirRewards = ratePerSecond * SECONDS_IN_YEAR;

  const collateralDecimals = Number(vault.collateralToken.decimals);

  const totalLpCollateral =
    Number(vault.reserveLPers || 0) / Math.pow(10, collateralDecimals);

  const teaSupply = Number(vault.teaSupply || 0);
  const lockedLiquidity = Number(vault.lockedLiquidity || 0);

  let externalLpRatio = 0;
  if (teaSupply > 0) {
    externalLpRatio = Math.max(
      0,
      (teaSupply - lockedLiquidity) / teaSupply
    );
  }

  const vaultCollateral = totalLpCollateral * externalLpRatio;
  if (vaultCollateral <= 0) return 0;

  let annualRewardsValue;
  const collateralIsSir =
    vault.collateralToken.id.toLowerCase() === sirAddress;

  if (collateralIsSir) {
    annualRewardsValue = annualSirRewards;
  } else {
    annualRewardsValue = annualSirRewards * sirPriceInCollateral;
  }

  if (!Number.isFinite(annualRewardsValue) || annualRewardsValue <= 0) {
    return 0;
  }

  return (annualRewardsValue / vaultCollateral) * 100;
}

/**
 * TVL in USD: LP collateral * collateral price in USD.
 */
function computeTvlUsd(vault, collateralPriceUsd) {
  if (!collateralPriceUsd || collateralPriceUsd <= 0) return 0;

  const collateralDecimals = Number(vault.collateralToken.decimals);

  const vaultCollateral =
    Number(vault.reserveLPers || 0) / Math.pow(10, collateralDecimals);

  if (vaultCollateral <= 0) return 0;

  return vaultCollateral * collateralPriceUsd;
}

/**
 * Build one price map across both chains.
 */
async function fetchPrices(allVaults) {
  const coins = new Set();

  // collateral tokens
  for (const { chainCfg, vault } of allVaults) {
    const token = vault.collateralToken.id;
    coins.add(`${chainCfg.priceKey}:${token.toLowerCase()}`);
  }

  // Native wrapped tokens for SIR price conversion
  for (const chainCfg of CHAIN_CONFIGS) {
    coins.add(`${chainCfg.priceKey}:${chainCfg.nativeWrapped.toLowerCase()}`);
  }

  const coinList = Array.from(coins);
  if (coinList.length === 0) return {};

  const prices = await utils.getPrices(coinList);
  return prices;
}

// Main adaptor function

async function apy() {
  const now = Math.floor(Date.now() / 1000);
  const timestampThreshold = now - LOOKBACK_SECONDS;

  // Collect vaults from both chains with their chain config attached
  const allVaults = [];
  for (const chainCfg of CHAIN_CONFIGS) {
    const vaults = await fetchVaultsForChain(chainCfg);
    for (const vault of vaults) {
      allVaults.push({ chainCfg, vault });
    }
  }

  if (!allVaults.length) return [];

  // Fetch prices and SIR DEX prices in parallel
  const [prices, ...sirDexPrices] = await Promise.all([
    fetchPrices(allVaults),
    ...CHAIN_CONFIGS.map((cfg) => fetchSirPriceFromDex(cfg)),
  ]);

  // Build SIR price map per chain (in native token)
  const sirPriceInNative = {};
  CHAIN_CONFIGS.forEach((cfg, idx) => {
    sirPriceInNative[cfg.key] = sirDexPrices[idx];
  });

  const pools = [];

  for (const { chainCfg, vault } of allVaults) {
    const chainKey = chainCfg.key;
    const chainName = chainCfg.chain;
    const sirAddress = chainCfg.sirAddress;

    const collateralAddress = vault.collateralToken.id.toLowerCase();

    const collateralPriceUsd = prices.pricesByAddress[collateralAddress] || 0;

    // Get native token price in USD
    const nativePriceUsd =
      prices.pricesByAddress[chainCfg.nativeWrapped.toLowerCase()] || 0;

    // Calculate SIR price in USD from DEX price
    const sirInNative = sirPriceInNative[chainKey] || 0;
    const sirPriceUsd = sirInNative * nativePriceUsd;

    const tvlUsd = computeTvlUsd(vault, collateralPriceUsd);
    if (!Number.isFinite(tvlUsd) || tvlUsd <= 0) {
      continue;
    }

    const fees = await fetchFeesForVault(
      chainCfg,
      vault.id,
      timestampThreshold
    );
    const feesApy = computeFeesApy(fees);

    const sirPriceInCollateral =
      collateralPriceUsd > 0 && sirPriceUsd > 0
        ? sirPriceUsd / collateralPriceUsd
        : 0;

    const sirRewardsApy = computeSirRewardsApy(
      vault,
      sirPriceInCollateral,
      sirAddress
    );

    const vaultIdDecimal = parseInt(vault.id, 16);
    const poolId = `${sirAddress}-${vaultIdDecimal}-${chainKey}`;
    const symbol = `${utils.formatSymbol(vault.collateralToken.symbol || "UNKNOWN")}-${utils.formatSymbol(vault.debtToken.symbol || "UNKNOWN")}`;
    const poolMeta = `Leverage ratio: ${1+2**(Number(vault.leverageTier))}`;
    const url = `${chainCfg.urlPrefix}${vault.id}`;

    pools.push({
      pool: poolId,
      chain: chainName, // "Ethereum" or "Hyperliquid L1"
      project: "sir",
      symbol,
      tvlUsd,
      apyBase: feesApy || 0,
      apyReward: sirRewardsApy || 0,
      rewardTokens: [sirAddress],
      underlyingTokens: [collateralAddress],
      poolMeta,
      url,
    });
  }

  return pools;
}

module.exports = {
  timetravel: false,
  apy,
};
