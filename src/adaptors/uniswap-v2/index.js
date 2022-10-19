const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url = 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswapv2';

const query = gql`
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

const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

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
  let queryC = query;
  let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
  dataNow = dataNow.pairs;

  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  let dataPrior = await request(
    url,
    queryPriorC.replace('<PLACEHOLDER>', blockPrior)
  );
  dataPrior = dataPrior.pairs;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, chainString);
  // calculate apy
  let data = dataNow.map((el) => utils.apy(el, dataPrior, version));

  return data.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = chainString === 'ethereum' ? 'mainnet' : chainString;
    const url = `https://app.uniswap.org/#/add/v2/${token0}/${token1}?chain=${chain}`;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'uniswap-v2',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy,
      underlyingTokens,
      url,
    };
  });
};

const main = async (timestamp = null) => {
  let data = await topLvl('ethereum', url, query, queryPrior, 'v2', timestamp);

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
