const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

const chains = {
  ethereum: sdk.graph.modifyEndpoint(
    'DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G'
  ),
  base: sdk.graph.modifyEndpoint(
    'Gqm2b5J85n1bhCyDMpGbtbVn4935EvvdyHdHrx3dibyj'
  ),
  arbitrum: sdk.graph.modifyEndpoint(
    'G5TsTKNi8yhPSV7kycaE23oWbqv9zzNqR49FoEQjzq1r'
  ),
  polygon: sdk.graph.modifyEndpoint(
    'CwpebM66AH5uqS5sreKij8yEkkPcHvmyEs7EwFtdM5ND'
  ),
  unichain: sdk.graph.modifyEndpoint(
    'aa3YpPCxatg4LaBbLFuv2iBC8Jvs9u3hwt5GTpS4Kit'
  ),
  bsc: sdk.graph.modifyEndpoint('2qQpC8inZPZL4tYfRQPFGZhsE8mYzE67n5z3Yf5uuKMu'),
  avax: sdk.graph.modifyEndpoint(
    '49JxRo9FGxWpSf5Y5GKQPj5NUpX2HhpoZHpGzNEWQZjq'
  ),
  optimism: sdk.graph.modifyEndpoint(
    '6RBtsmGUYfeLeZsYyxyKSUiaA6WpuC69shMEQ1Cfuj9u'
  ),
};

const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      feeTier
      liquidity
      totalValueLockedUSD
      totalValueLockedToken0
      totalValueLockedToken1
      volumeUSD
      token0 {
        symbol
        decimals
        id
      }
      token1 {
        symbol
        decimals
        id
      }
    }
  }
`;

const topLvl = async (chainString, url, query, timestamp) => {
  try {
    const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
      url,
    ]);

    let queryC = query;
    let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
    dataNow = dataNow.pools;

    let dataPrior = await request(
      url,
      queryC.replace('<PLACEHOLDER>', blockPrior)
    );
    dataPrior = dataPrior.pools;

    dataNow = dataNow.map((p) => ({
      ...p,
      reserve0: p.totalValueLockedToken0,
      reserve1: p.totalValueLockedToken1,
    }));

    dataNow = await utils.tvl(dataNow, chainString);

    dataNow = dataNow.map((pool) => {
      const poolPrior = dataPrior.find((p) => p.id === pool.id);
      const volumeUSD = Number(pool.volumeUSD || 0);
      const volumeUSDPrior = Number(poolPrior?.volumeUSD || 0);
      const volumeUSD1d = volumeUSD - volumeUSDPrior;

      const feeTier = Number(pool.feeTier || 0);
      const feeUSD1d = (volumeUSD1d * feeTier) / 1e6;

      const apy =
        pool.totalValueLockedUSD > 0
          ? (feeUSD1d * 365 * 100) / pool.totalValueLockedUSD
          : 0;

      return {
        ...pool,
        apyBase: apy,
        volumeUsd1d: volumeUSD1d,
      };
    });

    return dataNow.map((p) => {
      const poolMeta = `${Number(p.feeTier) / 1e4}%`;
      const underlyingTokens = [p.token0.id, p.token1.id];
      const chain = chainString === 'avax' ? 'avalanche' : chainString;

      return {
        pool: `${p.id}-${chainString}-uniswap-v4`,
        chain: utils.formatChain(chainString),
        project: 'uniswap-v4',
        poolMeta: poolMeta,
        symbol: `${p.token0.symbol}-${p.token1.symbol}`,
        tvlUsd: p.totalValueLockedUSD,
        apyBase: p.apyBase,
        underlyingTokens,
        url: `https://app.uniswap.org/explore/pools/${chain}/${p.id}`,
        volumeUsd1d: p.volumeUsd1d,
      };
    });
  } catch (e) {
    console.log(chainString, e);
    return [];
  }
};

const main = async (timestamp = null) => {
  const data = [];
  for (const [chain, url] of Object.entries(chains)) {
    data.push(await topLvl(chain, url, query, timestamp));
  }
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy: main,
};
