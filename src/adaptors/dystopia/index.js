const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url =
  'https://api.thegraph.com/subgraphs/name/dystopia-exchange/dystopia-v2';

const query = gql`
  {
    pairs(first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
      reserve0
      reserve1
      token0 {
        id
        symbol
      }
      token1 {
        id
        symbol
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs(first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id 
      volumeUSD 
    }
  }
`;

const buildPool = (entry, chainString) => {
  const symbol = utils.formatSymbol(
    `${entry.token0.symbol}-${entry.token1.symbol}`
  );
  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'dystopia',
    symbol,
    tvlUsd: entry.totalValueLockedUSD,
    apy: entry.apy,
  };

  return newObj;
};

const topLvl = async (chainString, timestamp, url) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
  ]);

  dataNow = await request(url, query.replace('<PLACEHOLDER>', block));

  // pull 24h offset data to calculate fees from swap volume
  let dataPrior = await request(
    url,
    queryPrior.replace('<PLACEHOLDER>', blockPrior)
  );

  // calculate tvl
  dataNow = await utils.tvl(dataNow.pairs, 'polygon');

  // calculate apy
  let data = dataNow.map((el) => utils.apy(el, dataPrior.pairs, 'v2'));

  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async (timestamp = null) => {
  const data = await Promise.all([topLvl('polygon', timestamp, url)]);
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://www.dystopia.exchange/liquidity',
};
