const utils = require('../utils');
const sdk = require('@defillama/sdk');
const {
  utils: { formatEther, formatUnits },
} = require('ethers');

const IGammaVaultAbi = require('./IGammaVault.json');

// Note: we use GammaSwap internal API per-vault endpoint for live fields needed for APY
const GS_API_URL = "https://api.gammaswap.com/yield-tokens";

const CHAINS = {
  base: {
    chainId: 8453,
    subgraphUrl:
      "https://api.goldsky.com/api/public/project_clut9lukx80ry01xb5ngf1zmj/subgraphs/gammaswap-v1-base/prod/gn",
    vaultSubgraphUrl:
      "https://api.goldsky.com/api/public/project_clut9lukx80ry01xb5ngf1zmj/subgraphs/vaults-v1-base/prod/gn",
  },
  arbitrum: {
    chainId: 42161,
    subgraphUrl:
      "https://api.goldsky.com/api/public/project_clut9lukx80ry01xb5ngf1zmj/subgraphs/gammaswap-v1-arbitrum/prod/gn",
    vaultSubgraphUrl:
      "https://api.goldsky.com/api/public/project_clut9lukx80ry01xb5ngf1zmj/subgraphs/vaults-v1-arbitrum/prod/gn",
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

function overlapSec(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function normalizePeriodStrategies(periods, nowSec) {
  const sorted = [...periods].sort((a, b) => Number(a.periodNumber) - Number(b.periodNumber));

  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    const start = Number(cur.startTime);
    const end = Math.max(start, next ? Number(next.startTime) : nowSec);

    out.push({
      periodNumber: Number(cur.periodNumber),
      start,
      end,
      fees0: cur.totalFees0,
      fees1: cur.totalFees1,
      nav: cur.nav,
    });
  }

  return out;
}

function estimateTrailing24hFees(
  periods,
  nowSec,
  token0Decimals,
  token1Decimals,
  isReversed
) {
  const win0 = nowSec - SECONDS_IN_24_HRS;
  const win1 = nowSec;

  let est0 = 0;
  let est1 = 0;
  let startTime = undefined;

  for (const p of periods) {
    const dur = Math.max(1, p.end - p.start);
    const ovl = overlapSec(win0, win1, p.start, p.end);
    
    if (ovl <= 0) continue;

    // Capture the start time of the first period with non-zero overlap
    if (startTime === undefined) {
      startTime = p.start;
    }

    // matches decimals order coming from the subgraph
    const orderedToken0Decimals = isReversed ? token1Decimals : token0Decimals;
    const orderedToken1Decimals = isReversed ? token0Decimals : token1Decimals;

    const fees0 = Number(formatUnits(BigInt(p.fees0), orderedToken0Decimals))
    const fees1 = Number(formatUnits(BigInt(p.fees1), orderedToken1Decimals))

    // proportionally attribute fees to the overlapping fraction of the period
    est0 += (fees0 * ovl) / dur;
    est1 += (fees1 * ovl) / dur;
  }

  return { estFees0: est0, estFees1: est1, startTime: startTime };
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
  } = params;
  console.log("all params:\n", params)

  if (!periods.length) return 0;

  const normalized = normalizePeriodStrategies(periods, windowEndTime);
  const { estFees0, estFees1 } = estimateTrailing24hFees(normalized, windowEndTime, token0Decimals, token1Decimals, isReversed);

  const navAtWindowEnd = periods[periods.length - 1].nav;

  return calculate24hAveragedAPY(
    estFees0,
    estFees1,
    SECONDS_IN_24_HRS,
    isAssetToken0,
    token0Decimals,
    token1Decimals,
    currentPriceToken0,
    currentPriceToken1,
    navAtWindowEnd,
    isReversed,
  );
}

/**
 * Calculate APY from accumulated fees and window data
 */
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

  // converting from portioned fees in each token to all fees converted to each token
  const feesInToken0Num = orderedAccumulatedTotalFees0 + orderedAccumulatedTotalFees1 * Number(currentPriceToken0);
  const feesInToken1Num = orderedAccumulatedTotalFees1 + orderedAccumulatedTotalFees0 * Number(currentPriceToken1);

  const windowSeconds = Math.max(actualWindowSeconds, 1);
  const windowDays = Math.max(windowSeconds / SECONDS_IN_24_HRS, 1e-6);
  
  const assetTokenDecimals = isAssetToken0 ? token0Decimals : token1Decimals;
  const navNum = Number(formatUnits(BigInt(navAtWindowEnd), assetTokenDecimals));
  
  if (navNum <= 0) {
    console.warn(`Invalid NAV: ${navNum}`);
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
  const lookbackTime = latestBlockTimestamp - (SECONDS_IN_24_HRS * 2);

  const periodStrategiesQuery = `{
    periodStrategies(
      where: {
        vault: "${vaultAddress.toLowerCase()}",
        startTime_gte: "${lookbackTime}"
      }
      orderBy: startTime
      orderDirection: asc
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
          const tokenSymbol = yt.symbol;
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
            symbol: utils.formatSymbol(tokenSymbol),
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
            poolMeta: "Yield Token",
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