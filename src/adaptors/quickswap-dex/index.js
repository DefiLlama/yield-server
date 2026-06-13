const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const url = sdk.graph.modifyEndpoint(
  'FUWdkXWpi8JyhAnhKL5pZcVshpxuaUQG8JHMDqNCxjPd'
);

const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
      reserve0
      reserve1
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

const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id 
      volumeUSD 
    }
  }
`;

const buildPool = (entry, chainString) => {
  const symbol = `${entry.token0.symbol}-${entry.token1.symbol}`;

  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'quickswap-dex',
    symbol,
    tvlUsd: entry.totalValueLockedUSD,
    apyBase: entry.apy1d,
    apyBase7d: entry.apy7d,
    underlyingTokens: [entry.token0.id, entry.token1.id],
    volumeUsd1d: entry.volumeUSD1d,
    volumeUsd7d: entry.volumeUSD7d,
  };

  return newObj;
};

// Polygon indexers on the decentralized network can lag the one serving _meta
// by a few hundred blocks. Back off so any caught-up indexer can satisfy the
// pinned-block query instead of tripping "bad indexers: Unavailable".
const INDEXER_LAG_BUFFER = 300;

const topLvl = async (chainString, timestamp, url, version) => {
  let [block, blockPrior] = await utils.getBlocks(
    chainString,
    timestamp,
    [url]
  );
  block -= INDEXER_LAG_BUFFER;

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [url],
    604800
  );

  // pull data
  let data = (await request(url, query.replace('<PLACEHOLDER>', block))).pairs;

  // pull 24h offset data to calculate fees from swap volume
  const dataPrior = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior))
  ).pairs;

  // 7d offset
  const dataPrior7d = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs;

  // calculate tvl
  data = await utils.tvl(data, chainString);

  // calculate apy
  data = data.map((el) => utils.apy(el, dataPrior, dataPrior7d, version));

  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async (timestamp = null) => {
  const data = await Promise.all([topLvl('polygon', timestamp, url, 'v2')]);
  const pools = data.flat().filter((p) => utils.keepFinite(p) && p.tvlUsd < 5e6);
  return addMerklRewardApy(pools, 'quickswap');
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://quickswap.exchange/#/pool',
};
