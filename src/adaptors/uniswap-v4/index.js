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

const DYNAMIC_FEE_FLAG = 0x800000;

const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
      id
      feeTier
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

const isDynamicFeePool = (feeTier) => Number(feeTier) === DYNAMIC_FEE_FLAG;

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
      const isDynamic = isDynamicFeePool(pool.feeTier);

      const volumeUSD1d =
        Number(pool.volumeUSD || 0) - Number(poolPrior?.volumeUSD || 0);

      // dynamic fee pools use hooks, can't calculate fees from feeTier
      const feeUSD1d = isDynamic
        ? 0
        : (volumeUSD1d * Number(pool.feeTier) || 0) / 1e6;

      const apy =
        pool.totalValueLockedUSD > 0 && feeUSD1d > 0
          ? (feeUSD1d * 365 * 100) / pool.totalValueLockedUSD
          : 0;

      return {
        ...pool,
        apyBase: apy,
        volumeUsd1d: volumeUSD1d,
      };
    });

    return dataNow.map((p) => {
      const isDynamic = isDynamicFeePool(p.feeTier);

      let poolMeta;
      if (isDynamic) {
        poolMeta = 'Dynamic fee (hook)';
      } else {
        const feePercent = (Number(p.feeTier) / 1e4).toFixed(2);
        poolMeta = `${feePercent}%`;
      }

      const underlyingTokens = [p.token0.id, p.token1.id];
      const chain = chainString === 'avax' ? 'avalanche' : chainString;

      return {
        pool: `${p.id}-${chainString}-uniswap-v4`,
        chain: utils.formatChain(chainString),
        project: 'uniswap-v4',
        poolMeta,
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
  return data
    .flat()
    .filter((p) => utils.keepFinite(p))
    .filter((p) => !(p.tvlUsd > 1e7 && p.volumeUsd1d < 10));
};

module.exports = {
  apy: main,
};
