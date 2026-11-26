const axios = require('axios');
const BN = require('bignumber.js');
const { request, gql } = require('graphql-request');

const { formatChain, withRetry } = require('../utils');

// Tokens from dHEDGE fund composition that don't resolve in the price API
const TOROS_UNRESOLVABLE = {
  '0x794a61358d6845594f94dc1db02a252b5b4814ad': '0x0b2c639c533813f4aa9d7837caf62653d097ff85', // Aave V3 on OP → USDC
  '0xa238dd80c259a72e81d7e4664a9801593f98d1c5': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Morpho on Base → USDC
};
const resolveTorosToken = (addr) => TOROS_UNRESOLVABLE[addr?.toLowerCase()] || addr;

// mStable vaults on dHEDGE infra (owned by mstable-v2, mstable-yield), and
// BTCSHORTVOL, whose API apy (~1700%) contradicts its own performance metrics.
const EXCLUDED_VAULTS = new Set([
  '0xfec2adfa296fe189f53089fd5ccd8c28dd559cf2',
  '0x9c6de13d4648a6789017641f6b1a025816e66228',
  '0x8c068d7033d66c4aacab25ce8219e5688c60155f',
]);

const DHEDGE_REWARDS_API_URL = 'https://app.dhedge.org/api/rewards';

const DHEDGE_API_URL = 'https://api-v2.dhedge.org/graphql';

const VAULT_ADDRESSES_QUERY = gql`
  query VaultAddresses {
    yieldProducts {
      address
    }
    apyForTorosFunds {
      fundAddress
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

const fetchVaultAddresses = async () => {
  try {
    const { yieldProducts, apyForTorosFunds } = await withRetry(() =>
      request(DHEDGE_API_URL, VAULT_ADDRESSES_QUERY)
    );
    return [
      ...new Set(
        [
          ...yieldProducts.map(({ address }) => address),
          ...apyForTorosFunds.map(({ fundAddress }) => fundAddress),
        ].map((address) => address.toLowerCase())
      ),
    ];
  } catch (err) {
    console.error('Failed to fetch toros vault list: ', err);
    return [];
  }
};

// Sequential: the dHEDGE API answers a burst of vault queries with 429s.
const fetchTorosYieldProducts = async () => {
  const products = [];
  for (const address of await fetchVaultAddresses()) {
    try {
      const { fund } = await withRetry(() =>
        request(DHEDGE_API_URL, POOL_DATA_QUERY, { address })
      );
      if (fund) products.push(fund);
    } catch (err) {
      console.error(`Failed to fetch toros vault ${address}: `, err);
    }
  }
  return products;
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

  const vaults = products.filter(
    ({ address }) => !EXCLUDED_VAULTS.has(address.toLowerCase())
  );

  return vaults.map(
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
  protocolId: '1881',
  timetravel: false,
  apy: listTorosYieldProducts,
};
