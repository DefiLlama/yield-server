const { request, gql } = require('graphql-request');
const utils = require('../utils');
const axios = require('axios');

const chains = {
  "ethereum": {
    // Replant 8/6/2022. Current yield history on the subgraph does not include prior values
    startBlock: 15289934,
    startTime: 1659800414,
    api: "https://api.bean.money/silo/yield",
    subgraph: "https://graph.bean.money/bean_eth/",
    // For Bean tokens which are no longer tracked by a Beanstalk, specifies an end block
    oldTokens: {
      // 2022 Exploit
      "0xdc59ac4fefa32293a95889dc396682858d52e5db": 14602790,
      // 2024 L2 migration
      "0xbea0000029ad1c77d3d5d23ba2d8893db9d1efab": 20921738
    }
  },
  "arbitrum": {
    // L2 migration 10/10/2024
    startBlock: 262211594,
    startTime: 1728528834,
    api: "https://api.bean.money/silo/yield",
    subgraph: "https://graph.bean.money/bean/",
    oldTokens: {}
  }
};

async function getPools(timestamp = null) {
  const pools = await Promise.all(Object.keys(chains).map(chain => getPoolsForChain(chain, timestamp)));
  return pools.flat();
}

async function getPoolsForChain(chain, timestamp) {

  if (timestamp && timestamp < chains[chain].startTime) {
    return [];
  }

  const resultPools = [];

  // When a timestamp is specified, determine which block to use
  let block;
  if (timestamp) {
    [block] = await utils.getBlocksByTime([timestamp], chain);
  }

  // Query subgraph to identify each yield-bearing pool and its info
  const poolData = await request(chains[chain].subgraph, gql`
    {
      beans${block ? `(block: {number: ${block}})` : ''} {
        id
        lastSeason
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

  // Avoid presenting old bean tokens that are not current to the requested time
  const beans = poolData.beans.filter(bean => {
    const endBlock = chains[chain].oldTokens[bean.id];
    return !endBlock || endBlock > block;
  });

  for (const bean of beans) {

    // Get apy info
    const apy = await axios.post(chains[chain].api, {
      season: bean.lastSeason,
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
      // Sort BEAN to be first in the token list
      const tokens = pool.tokens[0].name === 'BEAN' ? pool.tokens : [pool.tokens[1], pool.tokens[0]];
      resultPools.push({
        pool: (`${pool.id}-${chain}`).toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'beanstalk',
        symbol: `${tokens[0].name}-${tokens[1].name}`,
        tvlUsd: parseInt(pool.liquidityUSD),
        apyBase: 0,
        apyReward: Math.round(yields[pool.id].bean * 10000) / 100,
        rewardTokens: [bean.id],
        underlyingTokens: tokens.map(p => p.id.toLowerCase()),
        poolMeta: 'Beanstalk Silo'
      });
    }
  }
  return resultPools;
}

module.exports = {
  timetravel: true,
  apy: getPools,
  url: 'https://app.bean.money/#/silo'
};
