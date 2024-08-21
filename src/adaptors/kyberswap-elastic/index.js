const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const utils = require('../utils');

const urlFarm =
  'https://pool-farm.kyberswap.com/<CHAIN>/api/v1/elastic/farm-pools?page=1&perPage=10000';

CHAINS_API = {
  ethereum: sdk.graph.modifyEndpoint(
    '4U9PxDR4asVvfXyoVy18fhuj6NHnQhLzZkjZ5Bmuc5xk'
  ),
  arbitrum: sdk.graph.modifyEndpoint(
    'C36tj8jSpEHxcNbjM3z7ayUZHVjrk4HRqnpGMFuRgXs6'
  ),
  polygon: sdk.graph.modifyEndpoint(
    '8g4tJKCJ7eMAHjzZNeRWz9BkYG5U7vDNjdanSXfDXGXT'
  ),
  avalanche: sdk.graph.modifyEndpoint(
    '9oMJfc7CL8uDqqQ3T3NFBnFCz9JMwq2YhH9AqojECFWp'
  ),
  bsc: sdk.graph.modifyEndpoint('FDEDgycFnTbPZ7PfrnWEZ4iR7T5De6BR69zx1i8gKQRa'),
  fantom: sdk.graph.modifyEndpoint(
    '9aj6YZFVL647wFBQXnNKM72eiowP4fyzynQKwLrn5axL'
  ),
  cronos:
    'https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-cronos',
  optimism: sdk.graph.modifyEndpoint(
    '3Kpd8i7U94pTz3Mgdb8hyvT5o26fpwT7SUHAbTa6JzfZ'
  ),
};

const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
      feeTier
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
      totalValueLockedToken0
      totalValueLockedToken1
    }
  }
`;

const queryPrior = gql`
  {
    pools (first: 1000 orderBy: totalValueLockedUSD orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

const topLvl = async (chainString, url, timestamp) => {
  try {
    const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
      url,
    ]);

    // const [_, blockPrior7d] = await utils.getBlocks(
    //   chainString,
    //   timestamp,
    //   [url],
    //   604800
    // );

    let data = (await request(url, query.replace('<PLACEHOLDER>', block)))
      .pools;

    const dataPrior = (
      await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior))
    ).pools;

    // const dataPrior7d = (
    //   await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior7d))
    // ).pools;

    data = data.map((p) => ({
      ...p,
      reserve0: p.totalValueLockedToken0,
      reserve1: p.totalValueLockedToken1,
      feeTier: p.feeTier * 10,
    }));
    data = await utils.tvl(data, chainString);

    data = data.map((p) => utils.apy(p, dataPrior, []));

    const farmData = (await axios.get(urlFarm.replace('<CHAIN>', chainString)))
      .data.data.farmPools;

    return data.map((p) => {
      // farmData includes historical reward entries per pool.
      // filter to current one
      const farm = farmData
        .filter((x) => x.pool.id.toLowerCase() === p.id.toLowerCase())
        .sort((a, b) => b.pid - a.pid)[0];

      const apyReward = farm?.endTime > Date.now() / 1000 ? +farm?.apr : 0;

      const symbol = utils.formatSymbol(
        `${p.token0.symbol}-${p.token1.symbol}`
      );
      return {
        pool: p.id,
        chain: utils.formatChain(chainString),
        project: 'kyberswap-elastic',
        symbol,
        tvlUsd: p.totalValueLockedUSD,
        apyBase: p.apy1d,
        // apyBase7d: p.apy7d,
        apyReward,
        rewardTokens: apyReward > 0 ? farm.rewardTokens.map((r) => r.id) : [],
        underlyingTokens: [p.token0.id, p.token1.id],
        poolMeta: `${p.feeTier / 1e4}%`,
        volumeUsd1d: p.volumeUSD1d,
        // volumeUsd7d: p.volumeUSD7d,
      };
    });
  } catch (e) {
    if (e.message.includes('Stale subgraph')) return [];
    else throw e;
  }
};

const main = async (timestamp = null) => {
  const data = await Promise.allSettled(
    Object.entries(CHAINS_API).map(([chain, url]) =>
      topLvl(chain, url, timestamp)
    )
  );

  return data
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter(
      (p) =>
        utils.keepFinite(p) &&
        !p.symbol.includes('ANKRBNB') &&
        p.pool !== '0xfd117d9a917a8990cc8f804c0ce91f40340dacac'
    );
};

module.exports = {
  apy: main,
  timetravel: false,
  url: 'https://kyberswap.com/pools',
};
