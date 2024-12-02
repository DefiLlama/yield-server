const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const url =
  'https://metisapi.0xgraph.xyz/subgraphs/name/cryptoalgebra/analytics';

const query = gql`
  {
    pools(first: 1000 orderBy: totalValueLockedUSD orderDirection: desc block: {number: <PLACEHOLDER>}) {
        id
        volumeUSD
        token0 {
            symbol
            id
            decimals
        }
        token1 {
            id
            symbol
            decimals
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

  const balanceCalls = [];
  for (const pool of data) {
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
    permitFailure: true,
  });

  data = data.map((p) => {
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
