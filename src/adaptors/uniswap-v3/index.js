const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

const baseUrl = 'https://api.thegraph.com/subgraphs/name';
const url = `${baseUrl}/uniswap/uniswap-v3`;
const urlPolygon = `${baseUrl}/ianlapham/uniswap-v3-polygon`;
const urlArbitrum = `${baseUrl}/ianlapham/arbitrum-dev`;
const urlOptimism = `${baseUrl}/ianlapham/optimism-post-regenesis`;

const query = gql`
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
        decimals
      }
      token1 {
        symbol
        id
        decimals
      }
    }
  }
`;

const queryPrior = gql`
  {
    pools( first: 1000 orderBy: totalValueLockedUSD orderDirection:desc block: {number: <PLACEHOLDER>}) {
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
  dataNow = dataNow.pools;

  // uni v3 subgraph reserves values are wrong!
  // instead of relying on subgraph values, gonna pull reserve data from contracts
  // new tvl calc
  const balanceCalls = [];
  for (const pool of dataNow) {
    balanceCalls.push({
      target: pool.token0.id,
      params: pool.id,
    });
    balanceCalls.push({
      target: pool.token1.id,
      params: pool.id,
    });
  }

  const tokenBalances = await sdk.api.abi.multiCall({
    abi: 'erc20:balanceOf',
    calls: balanceCalls,
    chain: chainString,
  });

  dataNow = dataNow.map((p) => {
    const x = tokenBalances.output.filter((i) => i.input.params[0] === p.id);
    return {
      ...p,
      reserve0:
        x.find((i) => i.input.target === p.token0.id).output /
        `1e${p.token0.decimals}`,
      reserve1:
        x.find((i) => i.input.target === p.token1.id).output /
        `1e${p.token1.decimals}`,
    };
  });

  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  let dataPrior = await request(
    url,
    queryPriorC.replace('<PLACEHOLDER>', blockPrior)
  );
  dataPrior = dataPrior.pools;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, chainString);
  // calculate apy
  let data = dataNow.map((el) => utils.apy(el, dataPrior, version));

  return data.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const poolMeta = `${p.feeTier / 1e4}%`;
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = chainString === 'ethereum' ? 'mainnet' : chainString;

    const feeTier = Number(poolMeta.replace('%', '')) * 10000;
    const url = `https://app.uniswap.org/#/add/${token0}/${token1}/${feeTier}?chain=${chain}`;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'uniswap-v3',
      poolMeta,
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy,
      underlyingTokens,
      url,
    };
  });
};

const main = async (timestamp = null) => {
  let data = await Promise.all([
    // topLvl('ethereum', url, query, queryPrior, 'v3', timestamp),
    // topLvl('polygon', urlPolygon, query, queryPrior, 'v3', timestamp),
    topLvl('arbitrum', urlArbitrum, query, queryPrior, 'v3', timestamp),
    // topLvl('optimism', urlOptimism, query, queryPrior, 'v3', timestamp),
  ]);

  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
