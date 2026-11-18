const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const url = sdk.graph.modifyEndpoint(
  'FUWdkXWpi8JyhAnhKL5pZcVshpxuaUQG8JHMDqNCxjPd'
);
const factory = '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32';

const query = gql`
  {
    now: pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <BLOCK>}) {
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
    prior1d: pairs(first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <BLOCK_1D>}) {
      id
      volumeUSD
    }
    prior7d: pairs(first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <BLOCK_7D>}) {
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

  // one request, so one indexer answers every block: indexers on this
  // deployment disagree on cumulative volumeUSD by billions
  const result = await request(
    url,
    query
      .replace('<BLOCK>', block)
      .replace('<BLOCK_1D>', blockPrior)
      .replace('<BLOCK_7D>', blockPrior7d)
  );
  let data = result.now;

  // calculate tvl
  data = await utils.tvl(data, chainString);

  // calculate apy
  data = data.map((el) => utils.apy(el, result.prior1d, result.prior7d, version));

  // with feeTo set, pairs mint 1/6 of the fee growth to the protocol, so lps earn 0.25%
  const { output: feeTo } = await sdk.api.abi.call({
    target: factory,
    abi: 'function feeTo() view returns (address)',
    chain: chainString,
    block,
  });
  const lpFeeShare = /^0x0{40}$/i.test(feeTo) ? 1 : 5 / 6;
  data = data.map((p) => ({
    ...p,
    apy1d: p.apy1d * lpFeeShare,
    apy7d: p.apy7d * lpFeeShare,
  }));

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
  protocolId: '306',
  timetravel: true,
  apy: main,
  url: 'https://quickswap.exchange/#/pool',
};
