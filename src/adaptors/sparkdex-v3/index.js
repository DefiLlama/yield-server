const utils = require('../utils');

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
    `https://api.flaremetrics.io/v2/defi/flare/liquidity-pools?product=sparkdex-pool&tvlUSD=10000&limit=${limit}&offset=${offset}`
  );
}

/**
 * @param {number} now
 * @param {number} flrPrice
 * @returns {(lp: LPPage) => Pool[]}
 */
function makePoolFlatmap(now, flrPrice) {
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

    const apyBase = (feeUsd / tvlUsd) * 365 * 100;
    /**
     * @type {Pool}
     */
    const pool = {
      pool: `${address}-${chain}`.toLowerCase(),
      chain,
      project: 'sparkdex-v3',
      symbol: `${token0symbol}-${token1symbol}`,
      tvlUsd,
      apyBase,
      underlyingTokens: [token0address, token1address],
    };

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

    pool.apyReward = ((emission.dailyEmission * flrPrice) / tvlUsd) * 365 * 100;
    pool.rewardTokens = ['0x26d460c3Cf931Fb2014FA436a49e3Af08619810e']; // rFLR

    return pool;
  };
}

async function poolsFunction() {
  const now = Date.now();
  const flrPrice = await getFlrPrice();
  /**
   * @type {LPPage[]}
   */
  const liquidityPools = [];
  const limit = 250;

  for (let i = 0; i < 10; i += 1) {
    const offset = i * limit;
    const lpPage = await getLPPage(limit, offset);

    liquidityPools.push(...lpPage);

    if (lpPage.length < limit) break;
  }

  return liquidityPools.flatMap(makePoolFlatmap(now, flrPrice));
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://sparkdex.ai/apps/liquidity',
};
