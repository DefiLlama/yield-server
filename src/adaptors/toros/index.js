const BN = require('bignumber.js');
const { request, gql } = require('graphql-request');

const { formatChain } = require('../utils');

const DHEDGE_API_URL = 'https://api-v2.dhedge.org/graphql';

const YIELD_PRODUCTS_QUERY = gql`
  query YieldProducts {
    yieldProducts {
      address
    }
  }
`;

const POOL_DATA_QUERY = gql`
  query PoolData($address: String!) {
    fund(address: $address) {
      address
      blockchainCode
      blockTime
      fundComposition {
        amount
        tokenAddress
      }
      performanceMetrics {
        week
        month
        quarter
        halfyear
        year
      }
      symbol
      totalValue
    }
  }
`;

const formatValue = (value) => new BN(value).shiftedBy(-18).toNumber();

const getDaysSincePoolCreation = (blockTime) =>
  Math.round((Date.now() / 1000 - +blockTime) / 86400);

const calcApy = (blockTime, metrics) => {
  const daysActive = getDaysSincePoolCreation(blockTime);
  return daysActive >= 360
    ? (formatValue(metrics.year) - 1) * 100
    : daysActive >= 180
    ? (formatValue(metrics.halfyear) - 1) * 2 * 100
    : daysActive >= 90
    ? (formatValue(metrics.quarter) - 1) * 4 * 100
    : daysActive >= 30
    ? (formatValue(metrics.month) - 1) * 12 * 100
    : (formatValue(metrics.week) - 1) * 52 * 100;
};

const fetchTorosYieldProducts = async () => {
  try {
    const addresses = await request(DHEDGE_API_URL, YIELD_PRODUCTS_QUERY);
    const products = await Promise.all(
      addresses.yieldProducts.map(async ({ address }) => {
        const poolData = await request(DHEDGE_API_URL, POOL_DATA_QUERY, {
          address,
        });
        return poolData.fund;
      })
    );
    return products;
  } catch (err) {
    console.error('Failed to fetch toros yield pools: ', err);
    return [];
  }
};

const listTorosYieldProducts = async () => {
  const products = await fetchTorosYieldProducts();

  return products.map(
    ({
      address,
      blockchainCode,
      symbol,
      totalValue,
      performanceMetrics,
      blockTime,
      fundComposition,
    }) => ({
      pool: address,
      chain: formatChain(blockchainCode.toLowerCase()),
      project: 'toros',
      symbol,
      tvlUsd: formatValue(totalValue),
      apyBase: calcApy(blockTime, performanceMetrics),
      apyReward: null,
      underlyingTokens: fundComposition
        .filter(({ amount }) => amount !== '0')
        .map(({ tokenAddress }) => tokenAddress),
    })
  );
};

module.exports = {
  timetravel: false,
  apy: listTorosYieldProducts,
};
