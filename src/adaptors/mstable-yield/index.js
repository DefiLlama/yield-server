const BN = require('bignumber.js');
const { request, gql } = require('graphql-request');

const { formatChain } = require('../utils');

const DHEDGE_API_URL = 'https://api-v2.dhedge.org/graphql';

const MSTABLE_POOL_ADDRESSES = ['0x9c6de13d4648a6789017641f6b1a025816e66228'];

const MSTABLE_VAULT_BASE_URL = 'https://yield.mstable.org/vault/';

const FUNDS_QUERY = gql`
  query GetAllFundsByAddresses($addresses: [String]!) {
    allFundsByAddresses(addresses: $addresses) {
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

// APY with fallback calculation simply based on pool's past performance
const calcApy = (apy, blockTime, metrics) => {
  if (apy) {
    return Math.max(...Object.values(apy));
  }

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
const poolsFunction = async () => {
  try {
    const { allFundsByAddresses } = await request(DHEDGE_API_URL, FUNDS_QUERY, {
      addresses: MSTABLE_POOL_ADDRESSES,
    });

    return allFundsByAddresses.map(
      ({
        address,
        blockchainCode,
        symbol,
        totalValue,
        performanceMetrics,
        blockTime,
        fundComposition,
        apy,
      }) => ({
        pool: address,
        chain: formatChain(blockchainCode.toLowerCase()),
        project: 'mstable-yield',
        symbol,
        tvlUsd: formatValue(totalValue),
        apyBase: calcApy(apy, blockTime, performanceMetrics),
        underlyingTokens: fundComposition
          .filter(({ amount }) => amount !== '0')
          .map(({ tokenAddress }) => tokenAddress),
        url: `${MSTABLE_VAULT_BASE_URL}${address}`,
      })
    );
  } catch (error) {
    console.error('Failed to fetch mStable pools', error);

    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
