const { request, gql } = require('graphql-request');
const utils = require('../utils');
const axios = require('axios');

const START_TIME = 1732071601; // First silo yield distribution at Season 4.
const API = "https://api.pinto.money/silo/yield"
const SUBGRAPH = "https://graph.pinto.money/pinto/"

async function getPools(timestamp = null) {
  const pools = await getPoolsForChain("base", timestamp);
  return pools.flat();
}

async function getPoolsForChain(chain, timestamp) {

  if (timestamp && timestamp < START_TIME) {
    return [];
  }

  const resultPools = [];

  // When a timestamp is specified, determine which block to use
  let block;
  if (timestamp) {
    [block] = await utils.getBlocksByTime([timestamp], chain);
  }

  // Query subgraph to identify each yield-bearing pool and its info
  const poolData = await request(SUBGRAPH, gql`
    {
      beans${block ? `(block: {number: ${block}})` : ''} {
        id
        currentSeason {
          season
        }
        pools {
          id
          liquidityUSD
          tokens {
            id
            name
          }
        }
      }
    }`
  );

  for (const bean of poolData.beans) {

    // Get apy info
    const apy = await axios.post(API, {
      season: bean.currentSeason.season,
      emaWindows: [720],
      tokens: bean.pools.map(p => p.id),
      options: {
        initType: 'NEW'
      }
    });
    // Uses the available window if fewer datapoints were available
    const yields = apy.data.yields[Object.keys(apy.data.yields)[0]];
    const pools = bean.pools.filter(p => yields[p.id]);

    // Add results for each pool
    for (const pool of pools) {
      // Sort PINTO to be first in the token list
      const tokens = pool.tokens[0].name === 'PINTO' ? pool.tokens : [pool.tokens[1], pool.tokens[0]];
      resultPools.push({
        pool: (`${pool.id}-${chain}`).toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'pinto',
        symbol: `${tokens[0].name}-${tokens[1].name}`,
        tvlUsd: parseInt(pool.liquidityUSD),
        apyBase: 0,
        apyReward: Math.round(yields[pool.id].bean * 10000) / 100,
        rewardTokens: [bean.id],
        underlyingTokens: tokens.map(p => p.id.toLowerCase()),
        poolMeta: 'Pinto Silo'
      });
    }
  }
  return resultPools;
}

module.exports = {
  timetravel: true,
  apy: getPools,
  url: 'https://pinto.money/'
};
