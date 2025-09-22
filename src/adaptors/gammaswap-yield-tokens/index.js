const utils = require('../utils');
const sdk = require('@defillama/sdk');
const {
  utils: { formatEther, formatUnits },
} = require('ethers');

// Load the IGammaVault ABI
const IGammaVaultAbi = require('./IGammaVault.json');

// Note: we use GammaSwap internal API per-vault endpoint for live fields needed for APY

const GS_API_URL = "https://staging-api.gammaswap.com/yield-tokens";

// Chain configurations
const CHAINS = {
  base: {
    chainId: 8453,
    subgraphUrl:
      "https://api.goldsky.com/api/public/project_clut9lukx80ry01xb5ngf1zmj/subgraphs/gammaswap-v1-base/prod/gn",
    vaultSubgraphUrl:
      "https://api.goldsky.com/api/public/project_clut9lukx80ry01xb5ngf1zmj/subgraphs/vaults-v1-base/prod/gn",
    weethAddress: "0x04c0599ae5a44757c0af6f9ec3b93da8976c150a",
    pools: [
      "0x679fc242cea26358026dae06bf7613384d0877bf", // weETH/USDC
    ],
  },
  arbitrum: {
    chainId: 42161,
    subgraphUrl:
      "https://api.goldsky.com/api/public/project_clut9lukx80ry01xb5ngf1zmj/subgraphs/gammaswap-v1-arbitrum/prod/gn",
    vaultSubgraphUrl:
      "https://api.goldsky.com/api/public/project_clut9lukx80ry01xb5ngf1zmj/subgraphs/vaults-v1-arbitrum/prod/gn",
    weethAddress: "0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe",
    pools: [
      "0x1234567890123456789012345678901234567890", // weETH/USDC (placeholder)
    ],
  },
};

const SECONDS_IN_24_HRS = 24 * 60 * 60;

// Helper function to fetch data from subgraph (uses project utils)
async function fetchFromSubgraph(url, query) {
  return utils.getData(url, { query });
}

/**
 * Extract and parse the calculateNAV result from smart contract call
 */
function parseNAVResult(navResult) {
  const [nav, amount0, amount1, gsPnl, isGSPnLNeg] = navResult;

  return {
    nav: BigInt(nav.toString()),
    amount0: BigInt(amount0.toString()),
    amount1: BigInt(amount1.toString()),
    gsPnl: BigInt(gsPnl.toString()),
    isGSPnLNeg: Boolean(isGSPnLNeg)
  };
}

/**
 * Calculate NAV by making a smart contract call to the vault
 */
async function calculateNAV(vaultAddress, chainKey) {
  try {
    const chainConfig = CHAINS[chainKey];
    if (!chainConfig) {
      throw new Error(`Chain configuration not found for ${chainKey}`);
    }

    const navResult = await sdk.api.abi.call({
      target: vaultAddress,
      abi: IGammaVaultAbi.find((m) => m.name === 'calculateNAV'),
      chain: chainKey,
    });

    if (!navResult.output) {
      throw new Error(`No output from calculateNAV call for vault ${vaultAddress}`);
    }

    return parseNAVResult(navResult.output);
  } catch (error) {
    console.error(`Error calculating NAV for vault ${vaultAddress}: ${error}`);
    return null;
  }
}


// Calculate 24h averaged APY
function calculateLatestStrategyAPY(params) {
  const {
    periods,
    windowEndTime,
    isAssetToken0,
    token0Decimals,
    token1Decimals,
    currentPriceToken0,
    currentPriceToken1,
    isReversed,
    skipEventTypes = ["REBALANCE"],
  } = params;
  console.log("all params:\n", params)

  const TOLERANCE = 3600; // 1 hour
  const MAX_WINDOW = SECONDS_IN_24_HRS + TOLERANCE;

  if (periods.length === 0) {
    return 0;
  }

  const validPeriods = periods.filter(
    (p) =>
      p.nav && p.startTime && !skipEventTypes.includes(p.lastEventType || ""),
  );

  if (validPeriods.length === 0) {
    return 0;
  }

  let totalFees0 = BigInt(0);
  let totalFees1 = BigInt(0);

  let periodStart = validPeriods[0];
  let windowStartTime = parseInt(periodStart.startTime);

  for (let i = 0; i < validPeriods.length; i++) {
    const candidate = validPeriods[i];
    const candidateTime = parseInt(candidate.startTime);

    if (windowEndTime - candidateTime >= MAX_WINDOW) {
      periodStart = candidate;
      windowStartTime = candidateTime;
      break;
    }

    totalFees0 += BigInt(candidate.totalFees0);
    totalFees1 += BigInt(candidate.totalFees1);

    periodStart = candidate;
    windowStartTime = candidateTime;
  }

  const actualWindowSeconds = windowEndTime - windowStartTime;

  return calculate24hAveragedAPY(
    totalFees0,
    totalFees1,
    actualWindowSeconds,
    isAssetToken0,
    token0Decimals,
    token1Decimals,
    currentPriceToken0,
    currentPriceToken1,
    validPeriods[0].nav,
    isReversed,
  );
}

// Calculate APY from accumulated fees and window data
function calculate24hAveragedAPY(
  totalFees0,
  totalFees1,
  actualWindowSeconds,
  isAssetToken0,
  token0Decimals,
  token1Decimals,
  currentPriceToken0,
  currentPriceToken1,
  navAtWindowEnd,
  isReversed,
) {
  // check for reversal since fees are stored depending on token order from subgraph
  const orderedAccumulatedTotalFees0 = isReversed ? totalFees1 : totalFees0;
  const orderedAccumulatedTotalFees1 = isReversed ? totalFees0 : totalFees1;

  const orderedAccumulatedTotalFees0Num = Number(
    formatUnits(orderedAccumulatedTotalFees0, token0Decimals),
  );
  const orderedAccumulatedTotalFees1Num = Number(
    formatUnits(orderedAccumulatedTotalFees1, token1Decimals),
  );

  // converting from portioned fees in each token to all fees converted to each token
  const feesInToken0Num =
    orderedAccumulatedTotalFees0Num +
    orderedAccumulatedTotalFees1Num * Number(currentPriceToken0);
  const feesInToken1Num =
    orderedAccumulatedTotalFees1Num +
    orderedAccumulatedTotalFees0Num * Number(currentPriceToken1);

  const windowSeconds = Math.max(actualWindowSeconds, 1);
  const windowDays = Math.max(windowSeconds / SECONDS_IN_24_HRS, 1e-6);

  const navNum = Number(navAtWindowEnd);

  if (navNum <= 0) {
    return 0;
  }

  return calculateAnnualizedStrategyAPY(
    feesInToken0Num,
    feesInToken1Num,
    navNum,
    isAssetToken0,
    currentPriceToken0,
    currentPriceToken1,
    windowDays,
  );
}

function calculateAnnualizedStrategyAPY(
  feesInToken0Num,
  feesInToken1Num,
  navNum,
  isAssetToken0,
  currentPriceToken0,
  currentPriceToken1,
  windowDays,
) {
  let yieldInAssetToken;
  let yieldInNonAssetToken;

  if (isAssetToken0) {
    yieldInAssetToken = feesInToken0Num / navNum;

    const navInToken1 = navNum * currentPriceToken1;
    yieldInNonAssetToken = navInToken1 > 0 ? feesInToken1Num / navInToken1 : 0;
  } else {
    yieldInAssetToken = feesInToken1Num / navNum;

    const navInToken0 = navNum * currentPriceToken0;
    yieldInNonAssetToken = navInToken0 > 0 ? feesInToken0Num / navInToken0 : 0;
  }

  const feeYieldWindow = Math.max(yieldInAssetToken, yieldInNonAssetToken);

  // Annualized fee yield
  const feeAPR = feeYieldWindow * (365 / windowDays);

  return feeAPR;
}

// Fetch period strategies from subgraph
async function fetchPeriodStrategies(
  chainConfig,
  vaultAddress,
  latestBlockTimestamp,
  limitCount = 100,
) {
  const lookbackTime = latestBlockTimestamp - SECONDS_IN_24_HRS;

  const periodStrategiesQuery = `{
    periodStrategies(
      where: {
        vault: "${vaultAddress.toLowerCase()}",
        startTime_gte: "${lookbackTime}"
      }
      orderBy: startTime
      orderDirection: desc
      first: ${limitCount}
    ) {
      id
      periodNumber
      nav
      startTime
      totalFees0
      totalFees1
      lastEventType
      totalSupply
    }
  }`;

  const periodStrategiesData = await fetchFromSubgraph(
    chainConfig.vaultSubgraphUrl,
    periodStrategiesQuery,
  );

  if (
    !periodStrategiesData.data ||
    !periodStrategiesData.data.periodStrategies
  ) {
    return [];
  }

  const periodStrategies = periodStrategiesData.data.periodStrategies || [];
  const result = [];

  for (const strategy of periodStrategies) {
    if (strategy.nav && strategy.startTime) {
      result.push({
        id: strategy.id,
        periodNumber: strategy.periodNumber,
        nav: strategy.nav,
        startTime: strategy.startTime,
        totalFees0: strategy.totalFees0 || "0",
        totalFees1: strategy.totalFees1 || "0",
        lastEventType: strategy.lastEventType,
        totalSupply: strategy.totalSupply,
      });
    }
  }

  return result;
}

// Get strategy APY
async function getStrategyAPY(
  chainConfig,
  vaultAddress,
  feesInToken0,
  feesInToken1,
  currentNav,
  isAssetToken0,
  currentPriceToken0,
  currentPriceToken1,
  token0Decimals,
  token1Decimals,
  latestBlockTimestamp,
  isReversed,
) {
  try {
    const rows = await fetchPeriodStrategies(
      chainConfig,
      vaultAddress,
      latestBlockTimestamp,
    );

    if (rows.length === 0) {
      return 0;
    }

    const updatedRows = [...rows];
    if (updatedRows.length > 0) {
      const mostRecentPeriod = updatedRows[0];

      const orderedTotalFees0 = isReversed ? feesInToken1 : feesInToken0;
      const orderedTotalFees1 = isReversed ? feesInToken0 : feesInToken1;

      updatedRows[0] = {
        ...mostRecentPeriod,
        totalFees0: (
          BigInt(mostRecentPeriod.totalFees0) + orderedTotalFees0
        ).toString(),
        totalFees1: (
          BigInt(mostRecentPeriod.totalFees1) + orderedTotalFees1
        ).toString(),
        nav: currentNav.toString(),
      };
    }

    const feeAPR = calculateLatestStrategyAPY({
      periods: updatedRows,
      windowEndTime: latestBlockTimestamp,
      isAssetToken0,
      token0Decimals,
      token1Decimals,
      currentPriceToken0,
      currentPriceToken1,
      isReversed,
      skipEventTypes: ["REBALANCE"],
    });

    return feeAPR;
  } catch (error) {
    console.error(
      `Error calculating strategy APY for vault ${vaultAddress}: ${error}`,
    );
    return 0;
  }
}

// Main adaptor function
const apy = async () => {
  const pools = [];

  for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
    try {
      // Get current timestamp
      const latestBlockTimestamp = Math.floor(Date.now() / 1000);

      // Fetch vault list and token info from vault subgraph
      const vaultsQuery = `{
        vaults(first: 1000) {
          id
        }
      }`;

      const vaultsData = await fetchFromSubgraph(
        chainConfig.vaultSubgraphUrl,
        vaultsQuery,
      );

      if (!vaultsData.data || !vaultsData.data.vaults) {
        continue;
      }

      for (const vaultRow of vaultsData.data.vaults) {
        try {
          // fetch per-vault data (combination of subgraph and smart contract data)
          const yt = await utils.getData(
            `${GS_API_URL}/${chainConfig.chainId}/${vaultRow.id}`,
          );
          if (!yt) continue;

          // Calculate NAV using smart contract call
          const navData = await calculateNAV(vaultRow.id, chainKey);
          if (!navData) continue;

          // gammavault onchain data
          const totalFees0Raw = yt.currentTotalFees0 || "0";
          const totalFees1Raw = yt.currentTotalFees1 || "0";
          const assetDecimals = Number(yt.assetToken.decimals);
          const nav = Number(formatUnits(navData.nav.toString(), assetDecimals));
          const isAssetToken0 = !!yt.isAssetToken0;
          const isReversed = !!yt.isReversed;
          const price0 = yt.currentPriceToken0 || 1;
          const price1 = yt.currentPriceToken1 || 1;
          const assetPrice = yt.assetTokenPriceUSD || 1;

          const token0Meta = yt.token0;
          const token1Meta = yt.token1;

          // Calculate APY
          const apyValue = await getStrategyAPY(
            chainConfig,
            vaultRow.id,
            BigInt(totalFees0Raw) || 0n,
            BigInt(totalFees1Raw) || 0n,
            nav,
            isAssetToken0,
            price0,
            price1,
            Number(token0Meta?.decimals),
            Number(token1Meta?.decimals),
            latestBlockTimestamp,
            isReversed,
          );

          // Format pool data according to DefiLlama schema
          const pool = {
            pool: `${vaultRow.id}-${chainKey}`,
            chain: utils.formatChain(chainKey),
            project: "gammaswap-yield-tokens",
            symbol: utils.formatSymbol(`${token0Meta?.symbol || "T0"}-${token1Meta?.symbol || "T1"}`),
            tvlUsd: (() => {
              try {
                // Calculate TVL as NAV * assetTokenPriceUSD
                return  nav * assetPrice;
              } catch (e) {
                return 0;
              }
            })(),
            apyBase: apyValue * 100, // convert to %
            underlyingTokens: [
              token0Meta?.id || vaultRow.token0?.id,
              token1Meta?.id || vaultRow.token1?.id,
            ],
            poolMeta: "Yield Token Strategy APY",
            url: `https://app.gammaswap.com/yield-tokens/${chainKey}/${vaultRow.id}`,
          };

          pools.push(pool);
        } catch (error) {
          console.error(`Error processing vault ${vaultRow.id}: ${error}`);
        }
      }
    } catch (error) {
      console.error(`Error processing chain ${chainKey}: ${error}`);
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: "https://app.gammaswap.com/yield-tokens",
};