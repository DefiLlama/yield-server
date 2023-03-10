const axios = require('axios');
const BN = require('bignumber.js');
const { request, gql } = require('graphql-request');

const { formatChain } = require('../utils');

const DHEDGE_REWARDS_API_URL = 'https://app.dhedge.org/api/rewards';

const DHEDGE_API_URL = 'https://api-v2.dhedge.org/graphql';

const YIELD_PRODUCTS_QUERY = gql`
  query YieldProducts {
    yieldProducts {
      address
    }
    apyForTorosFunds {
      fundAddress
      monthly
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

// Fallback APY calculation simply based on pool's past performance
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
    const response = await request(DHEDGE_API_URL, YIELD_PRODUCTS_QUERY);
    const apyData = response.apyForTorosFunds;
    const products = await Promise.all(
      response.yieldProducts.map(async ({ address }) => {
        const { fund } = await request(DHEDGE_API_URL, POOL_DATA_QUERY, {
          address,
        });
        const poolApyData = apyData.find(
          ({ fundAddress }) => fundAddress === fund.address
        );
        return { ...fund, apy: poolApyData?.monthly };
      })
    );
    return products;
  } catch (err) {
    console.error('Failed to fetch toros yield pools: ', err);
    return [];
  }
};

const fetchRewardIncentivesData = async () => {
  try {
    const response = await axios.get(DHEDGE_REWARDS_API_URL);
    return response.data;
  } catch (err) {
    console.error('Failed to fetch toros reward data: ', err);
    return;
  }
};

const listTorosYieldProducts = async () => {
  const [products, rewardData] = await Promise.all([
    fetchTorosYieldProducts(),
    fetchRewardIncentivesData(),
  ]);

  return products.map(
    ({
      address,
      blockchainCode,
      symbol,
      totalValue,
      performanceMetrics,
      blockTime,
      fundComposition,
      apy,
    }) => {
      const rewardIncentivisedPool = rewardData?.poolsWithRewards
        .map((address) => address.toLowerCase())
        .includes(address.toLowerCase());
      return {
        pool: address,
        chain: formatChain(blockchainCode.toLowerCase()),
        project: 'toros',
        symbol,
        tvlUsd: formatValue(totalValue),
        apy: apy ?? calcApy(blockTime, performanceMetrics),
        rewardTokens:
          rewardIncentivisedPool && rewardData?.rewardToken
            ? [rewardData.rewardToken]
            : [],
        underlyingTokens: fundComposition
          .filter(({ amount }) => amount !== '0')
          .map(({ tokenAddress }) => tokenAddress),
        url: `https://toros.finance/pool/${address}`,
      };
    }
  );
};

module.exports = {
  timetravel: false,
  apy: listTorosYieldProducts,
};
