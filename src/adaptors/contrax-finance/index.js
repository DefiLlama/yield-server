const utils = require('../utils');
const axios = require('axios');

/**
 * @typedef {Object} Pool
 * @property {string} pool
 * @property {string} chain
 * @property {string} project
 * @property {string} symbol
 * @property {number} tvlUsd
 * @property {number} [apyBase]
 * @property {number} [apyReward]
 * @property {Array<string>} [rewardTokens]
 * @property {Array<string>} [underlyingTokens]
 * @property {string} [poolMeta]
 * @property {string} [url]
 * @property {number} [apyBaseBorrow]
 * @property {number} [apyRewardBorrow]
 * @property {number} [totalSupplyUsd]
 * @property {number} [totalBorrowUsd]
 * @property {number} [ltv]
 */

/**
 * @typedef {Object} ApyData
 * @property {string} _id
 * @property {string} address
 * @property {number} apy
 * @property {number} compounding
 * @property {string} createdAt
 * @property {number} farmId
 * @property {number} feeApr
 * @property {string} name
 * @property {number} rewardsApr
 * @property {string} updatedAt
 * @property {{ apy: number, compounding: number, feeApr: number, rewardsApr: number }} apys
 */

/**
 * @typedef {Object} VaultData
 * @property {string} address
 * @property {number} depositedTvl
 */


const apysFunction = async () => {
  /**
   * @type {Pool[]}
   */
  let pools = [];
  const res = await axios.get(
    'https://contrax-backend.herokuapp.com/api/v1/vault/apy'
  );
  const res2 = await axios.get(
    'https://contrax-backend.herokuapp.com/api/v1/stats/tvl/vaults'
  );
  /**
   * @type {ApyData[]}
   */
  const data = res.data.data;

  /**
   * @type {VaultData[]}
   */
  const vaultsData = res2.data.data.vaults;

  data.forEach((item) => {
    pools.push({
      chain: utils.formatChain('Arbitrum'),
      pool: `${item.address}-Arbitrum`.toLowerCase(),
      project: 'contrax-finance',
      symbol: utils.formatSymbol(item.name),
      apyBase: item.apys.apy,
      tvlUsd: vaultsData.find(
        (i) => i.address.toLowerCase() === item.address.toLowerCase()
      )?.depositedTvl || 0,
    });
  });
  return pools;
};

module.exports = {
  timetravel: false,
  apy: apysFunction,
  url: 'https://beta.contrax.finance/earn',
};
