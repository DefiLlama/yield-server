const axios = require('axios');
const BN = require('bignumber.js');
const { request, gql } = require('graphql-request');

const { formatChain } = require('../utils');

// Tokens from dHEDGE fund composition that don't resolve in the price API
const TOROS_UNRESOLVABLE = {
  '0x794a61358d6845594f94dc1db02a252b5b4814ad': '0x0b2c639c533813f4aa9d7837caf62653d097ff85', // Aave V3 on OP → USDC
  '0xa238dd80c259a72e81d7e4664a9801593f98d1c5': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Morpho on Base → USDC
};
const resolveTorosToken = (addr) => TOROS_UNRESOLVABLE[addr?.toLowerCase()] || addr;

const DHEDGE_REWARDS_API_URL = 'https://app.dhedge.org/api/rewards';

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
      apy {
        monthly
        weekly
      }
    }
  }
`;

const formatValue = (value) => new BN(value).shiftedBy(-18).toNumber();

const getDaysSincePoolCreation = (blockTime) =>
  Math.round((Date.now() / 1000 - +blockTime) / 86400);

const chooseApy = (apy, blockTime, metrics) => {
  if (!apy) return calcApy(blockTime, metrics);

  return apy.weekly;
};

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
    const products = await Promise.all(
      response.yieldProducts.map(async ({ address }) => {
        const { fund } = await request(DHEDGE_API_URL, POOL_DATA_QUERY, {
          address,
        });
        return fund;
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
        ?.map((addr) => addr.toLowerCase())
        ?.includes(address.toLowerCase());
      return {
        pool: address,
        chain: formatChain(blockchainCode.toLowerCase()),
        project: 'toros',
        symbol,
        tvlUsd: formatValue(totalValue),
        apy: chooseApy(apy, blockTime, performanceMetrics),
        rewardTokens:
          rewardIncentivisedPool && rewardData?.rewardToken
            ? [rewardData.rewardToken]
            : [],
        underlyingTokens: fundComposition
          .filter(({ amount }) => amount !== '0')
          .map(({ tokenAddress }) => resolveTorosToken(tokenAddress)),
        url: `https://toros.finance/vault/${address}`,
      };
    }
  );
};

module.exports = {
  timetravel: false,
  apy: listTorosYieldProducts,
};
