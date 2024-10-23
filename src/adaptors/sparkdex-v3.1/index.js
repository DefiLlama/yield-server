const utils = require('../utils');

/**
 * @typedef {Object} Token
 * @property {string} address - The token's contract address
 * @property {string} symbol - The token's symbol (e.g., 'USDC')
 * @property {string} decimals - The number of decimal places for the token
 */

/**
 * @typedef {Object} AprProvider
 * @property {string} provider - The name of the APR provider
 * @property {number} apr - The Annual Percentage Rate value
 * @property {boolean} [isPoolApr] - Optional flag indicating if this is a pool APR
 */

/**
 * @typedef {Object} Pool
 * @property {string} id - Unique identifier for the pool
 * @property {number} feeTier - The fee tier for the pool
 * @property {number} tvlToken0 - Total Value Locked for token0
 * @property {number} tvlToken1 - Total Value Locked for token1
 * @property {string} reserve0 - Reserve amount for token0
 * @property {string} reserve1 - Reserve amount for token1
 * @property {Token} token0 - First token in the pair
 * @property {Token} token1 - Second token in the pair
 * @property {number} token0Price - Price of token0 in terms of token1
 * @property {number} token1Price - Price of token1 in terms of token0
 * @property {(number|string)} liquidity - Pool's liquidity value
 * @property {number} tvlUSD - Total Value Locked in USD
 * @property {number} tvlUSDDay - Daily change in TVL (USD)
 * @property {number} tvlUSDChangeDay - Percentage change in TVL over 24h
 * @property {number} volumeUSD - Total volume in USD
 * @property {number} volumeUSDDay - 24h volume in USD
 * @property {number} volumeUSDWeek - 7d volume in USD
 * @property {number} volumeUSDChangeDay - Percentage change in volume over 24h
 * @property {number} volumeUSDChangeWeek - Percentage change in volume over 7d
 * @property {number} feesUSDDay - Fees collected in USD over 24h
 * @property {number} apr - Total Annual Percentage Rate
 * @property {Array<AprProvider>} aprs - Breakdown of APRs by provider
 */

/**
 * @typedef {Object} ChainData
 * @property {number} chain - Chain identifier
 * @property {Array<Pool>} data - Array of pools on this chain
 */

/**
 * @typedef {Array<ChainData>} SparkDexData
 */

/**
 * @typedef {Object} TokenPair
 * @property {string} token0Symbol - Symbol of the first token
 * @property {string} token1Symbol - Symbol of the second token
 */

/**
 * @typedef {Object} PoolStats
 * @property {number} totalTvlUSD - Total Value Locked across all pools in USD
 * @property {number} totalVolumeUSD - Total volume across all pools in USD
 * @property {number} averageApr - Average APR across all pools
 * @property {number} poolCount - Total number of pools
 */

/**
 * @typedef {Object} LPPage
 * @property {string} address
 * @property {Object} token0
 * @property {string} token0.address
 * @property {string} token0.symbol
 * @property {Object} token1
 * @property {string} token1.address
 * @property {string} token1.symbol
 * @property {Array} statistics
 * @property {number} statistics.tvlUSD
 * @property {number} statistics.feeUSD
 * @property {string} statistics.period
 * @property {Array} emissions
 * @property {number} emissions.dailyEmission
 * @property {string} emissions.startDate
 * @property {string} emissions.endDate
 */

/**
 * @typedef {Object} Pool
 * @property {string} pool
 * @property {string} chain
 * @property {string} project
 * @property {string} symbol
 * @property {number} tvlUsd
 * @property {number} apyBase
 * @property {number} apyReward
 * @property {Array} rewardTokens
 * @property {Array<string>} underlyingTokens
 * @property {string} poolMeta
 * @property {string} url
 * @property {number} apyBaseBorrow
 * @property {number} apyRewardBorrow
 * @property {number} totalSupplyUsd
 * @property {number} totalBorrowUsd
 * @property {number} ltv
 */

/**
 *
 * @returns {Promise<number>}
 */
function getFlrPrice() {
  return utils.getData('https://api.flaremetrics.io/v2/defi/flare/price');
}

/**
 *
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<LPPage[]>}
 */
function getLPPage(limit, offset) {
  return utils.getData(
    `https://api.flaremetrics.io/v2/defi/flare/liquidity-pools?product=sparkdex-pool-3-1&tvlUSD=10000&limit=${limit}&offset=${offset}`
  );
}

/**
 * Gets all pools and apr details for a SparkDex V3_1
 * @returns {SparkDexData} The complete SparkDex data
 */
function getVaultAprDetails() {
  return utils.getData(
    `https://mv-platform.vercel.app/dex/v3/pairs?chainId=14&dex=SparkDEX&version=v3_1`
  );
}

/**
 * Creates a mapping of pool addresses to their detailed APR information
 * @param {SparkDexData} vaultData
 * @returns {Map<string, { aprs: Array<AprProvider>, totalApr: number }>}
 */
function createVaultAprMap(vaultData) {
  const aprMap = new Map();

  // Assuming vaultData[0] contains the Flare chain data
  const pools = vaultData[0]?.data || [];

  pools.forEach((pool) => {
    const poolAddress = pool.id.toLowerCase();
    aprMap.set(poolAddress, {
      aprs: pool.aprs || [],
      totalApr: pool.apr || 0,
    });
  });

  return aprMap;
}

/**
 * @param {number} now
 * @param {number} flrPrice
 * @param {Map<string, { aprs: Array<AprProvider>, totalApr: number }>} vaultAprMap
 * @returns {(lp: LPPage) => Pool[]}
 */
function makePoolFlatmap(now, flrPrice, vaultAprMap) {
  /**
   * @param {LPPage} lp
   */
  return function poolFlatMap(lp) {
    const chain = 'Flare';
    const address = lp.address;
    const token0symbol = lp.token0.symbol;
    const token1symbol = lp.token1.symbol;
    const token0address = lp.token0.address;
    const token1address = lp.token1.address;
    const stats = lp.statistics.find((s) => s.period == '1d');

    if (!stats) return [];

    const tvlUsd = stats.tvlUSD;
    const feeUsd = stats.feeUSD;

    const baseApy = (feeUsd / tvlUsd) * 365 * 100;

    /**
     * @type {Pool}
     */
    const pool = {
      pool: `${address}-${chain}`.toLowerCase(),
      chain,
      project: 'sparkdex-v3.1',
      symbol: `${token0symbol}-${token1symbol}`,
      tvlUsd,
      apyBase: baseApy,
      underlyingTokens: [token0address, token1address],
    };

    // Get additional reward APR details from vault data
    const vaultDetails = vaultAprMap.get(address);

    if (vaultDetails) {
      // Extract other reward APRs
      const rewardAprs = vaultDetails.aprs.filter(
        (apr) => !apr.isPoolApr && apr.provider !== 'rFLR Rewards'
      );

      // Calculate total reward APY from all sources
      const totalRewardApy = rewardAprs.reduce((sum, apr) => sum + apr.apr, 0);

      // Add APR if there are rewards
      if (totalRewardApy > 0) {
        pool.apyReward = totalRewardApy;
      }
    }

    // Process emissions from LP data
    const emissions = lp.emissions || [];
    const emission = emissions.find((e) => {
      const startDate = Date.parse(e.startDate);
      const endDate = Date.parse(e.endDate);
      return now >= startDate && now < endDate;
    });

    if (!emission) {
      if (apyBase == 0) return [];

      return pool;
    }

    // rFLR can be swapped with 50% penalty instantly to wFLR or linear 12 months
    // so taking care to lower bund %50
    const emissionApy =
      (((emission.dailyEmission * flrPrice) / tvlUsd) * 365 * 100) / 2;

    // Add or update reward APY with emission rewards
    pool.apyReward = (pool.apyReward || 0) + emissionApy;
    pool.rewardTokens = ['0x26d460c3Cf931Fb2014FA436a49e3Af08619810e']; // rFLR

    return pool;
  };
}

async function poolsFunction() {
  const [now, flrPrice, vaultData] = await Promise.all([
    Promise.resolve(Date.now()),
    getFlrPrice(),
    getVaultAprDetails(),
  ]);

  /**
   * @type {LPPage[]}
   */
  const liquidityPools = [];
  const limit = 250;
  const vaultAprMap = createVaultAprMap(vaultData);

  for (let i = 0; i < 10; i += 1) {
    const offset = i * limit;
    const lpPage = await getLPPage(limit, offset);

    liquidityPools.push(...lpPage);

    if (lpPage.length < limit) break;
  }

  return liquidityPools.flatMap(makePoolFlatmap(now, flrPrice, vaultAprMap));
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://sparkdex.ai/apps/liquidity',
};
