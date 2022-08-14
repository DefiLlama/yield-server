const { request, gql } = require('graphql-request');

const utils = require('../utils');

const baseUrl = 'https://api.thegraph.com/subgraphs/name';
const urlV2 = `${baseUrl}/ianlapham/uniswapv2`;
const urlV3 = `${baseUrl}/uniswap/uniswap-v3`;
const urlPolygon = `${baseUrl}/ianlapham/uniswap-v3-polygon`;
const urlArbitrum = `${baseUrl}/ianlapham/arbitrum-minimal`;
const urlOptimism = `${baseUrl}/ianlapham/optimism-post-regenesis`;

const queryV2 = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      reserve0
      reserve1
      volumeUSD
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;

const queryPriorV2 = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

const queryV3 = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      totalValueLockedToken0
      totalValueLockedToken1
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
    }
  }
`;

const queryPriorV3 = gql`
  {
    pools( first: 1000 orderBy: totalValueLockedUSD orderDirection:desc block: {number: <PLACEHOLDER>}) {
      id 
      volumeUSD 
    }
  }
`;

const buildPool = (entry, version, chainString) => {
  const symbol = utils.formatSymbol(
    `${entry.token0.symbol}-${entry.token1.symbol}`
  );
  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'uniswap',
    poolMeta: version === 'v3' ? `${entry.feeTier / 1e4}%` : null,
    symbol,
    tvlUsd: entry.totalValueLockedUSD,
    apyBase: entry.apy,
    underlyingTokens: [entry.token0.id, entry.token1.id],
  };

  return newObj;
};

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp
) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
  ]);

  // pull data
  queryC = query;
  let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
  dataNow = version === 'v2' ? dataNow.pairs : dataNow.pools;

  // v3 subgraph has different fields, will copy and keep the v2 name
  if (version === 'v3') {
    for (const e of dataNow) {
      e['reserve0'] = e.totalValueLockedToken0;
      e['reserve1'] = e.totalValueLockedToken1;
    }
  }

  // pull 24h offset data to calculate fees from swap volume
  queryPriorC = queryPrior;
  let dataPrior = await request(
    url,
    queryPriorC.replace('<PLACEHOLDER>', blockPrior)
  );
  dataPrior = version === 'v2' ? dataPrior.pairs : dataPrior.pools;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, chainString);
  // calculate apy
  let data = dataNow.map((el) => utils.apy(el, dataPrior, version));

  // build pool objects
  data = data.map((el) => buildPool(el, version, chainString));

  return data;
};

const main = async (timestamp = null) => {
  let data = await Promise.all([
    topLvl('ethereum', urlV2, queryV2, queryPriorV2, 'v2', timestamp),
    topLvl('ethereum', urlV3, queryV3, queryPriorV3, 'v3', timestamp),
    topLvl('polygon', urlPolygon, queryV3, queryPriorV3, 'v3', timestamp),
    topLvl('arbitrum', urlArbitrum, queryV3, queryPriorV3, 'v3', timestamp),
    topLvl('optimism', urlOptimism, queryV3, queryPriorV3, 'v3', timestamp),
  ]);

  return data.flat().filter((p) => Number.isFinite(p.apyBase));
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://app.uniswap.org/#/pool?chain=mainnet',
};
