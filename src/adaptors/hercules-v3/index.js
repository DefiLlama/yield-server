const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const url ='https://metisapi.0xgraph.xyz/subgraphs/name/cryptoalgebra/analytics';

const query = gql`
  {
    pools(first: 1000 orderBy: totalValueLockedUSD orderDirection: desc block: {number: <PLACEHOLDER>}) {
        id
        volumeUSD
        token0 {
            symbol
            id
        }
        token1 {
            id
            symbol
        }
        reserve0: totalValueLockedToken0
        reserve1: totalValueLockedToken1
        feeOtZ
        feeZtO
        
    }
  }
`;

const queryPrior = gql`
  {
    pools(first: 1000 orderBy: totalValueLockedUSD orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id 
      volumeUSD 
    }
  }
`;

const topLvl = async (chainString, timestamp, url) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
  ]);

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [url],
    604800
  );

  let data = (await request(url, query.replace('<PLACEHOLDER>', block))).pools;

  // pull 24h offset data to calculate fees from swap volume
  const dataPrior = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior))
  ).pools;

  // 7d offset
  const dataPrior7d = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior7d))
  ).pools;

  data = await utils.tvl(data, chainString);

  data = data.map((p) => ({
    ...p,
    feeTier: (Number(p.feeOtZ) + Number(p.feeZtO)) / 2,
  }));
  data = data.map((el) => utils.apy(el, dataPrior, dataPrior7d, 'v3'));

  data = data.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'hercules-v3',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      underlyingTokens: [p.token0.id, p.token1.id],
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
      url: `https://app.hercules.exchange/pools/${p.id}`,
    };
  });

  return data;
};

const main = async (timestamp = null) => {
  console.log(timestamp);
  const data = await Promise.all([topLvl('metis', timestamp, url)]);
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: true,
  apy: main,
};
