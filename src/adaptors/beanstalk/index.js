const { request, gql } = require('graphql-request');
const utils = require('../utils');
const axios = require('axios');

const chains = {
  "ethereum": {
    // Replant 8/6/2022. Current yield history on the subgraph does not include prior values
    startBlock: 15289934,
    startTime: 1659800414,
    api: "https://api.bean.money/silo/yield",
    subgraph: "https://graph.node.bean.money/subgraphs/name/bean/",
    // For Bean tokens which are no longer tracked by a Beanstalk, specifies an end block
    oldTokens: {
      // 2022 Exploit
      "0xdc59ac4fefa32293a95889dc396682858d52e5db": 14602790
      // L2 migration? (future)
      // "0xbea0000029ad1c77d3d5d23ba2d8893db9d1efab": possibly in the future
    }
  }
};

async function getPools(timestamp = null) {
  return [
    ...await getPoolsForChain("ethereum", timestamp)
  ];
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
      beans(
        where: {chain: "${chain}"}
        ${block ? `block: {number: ${block}}` : ''}
      ) {
        id
        beanstalk
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

    const pools = bean.pools;
    // Get apy info
    const apy = await axios.post(chains[chain].api, {
      beanstalk: bean.beanstalk,
      season: bean.lastSeason,
      emaWindows: [720],
      tokens: pools.map(p => p.id),
      options: {
        initType: 'NEW'
      }
    });

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
        apyReward: Math.round(apy.data.yields[720][pool.id].bean * 10000) / 100,
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
