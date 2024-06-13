const sdk = require('@defillama/sdk');
const retry = require('async-retry');
const utils = require('../utils');
const { GraphQLClient, gql } = require('graphql-request');

async function tvl(timestamp) {
  let endpoint = sdk.graph.modifyEndpoint('CejrrsnSQAxHJBpkgiBrLHQZ7h2MkK9QArM8bJvN9GuQ');
  let graphQLClient = new GraphQLClient(endpoint);
  let query = gql`
    query apy($start: BigInt!, $end: BigInt!) {
      pearlBankMetrics(
        where: { timestamp_gte: $start, timestamp_lt: $end }
        orderBy: timestamp
        orderDirection: desc
        first: 1
      ) {
        apy
        pearlBankDepositedUsdValue
        clamPondDepositedUsdValue
      }
    }
  `;
  let latestMetricsQuery = gql`
    query apy {
      pearlBankMetrics(orderBy: timestamp, orderDirection: desc, first: 1) {
        apy
        pearlBankDepositedUsdValue
        clamPondDepositedUsdValue
      }
    }
  `;

  //if invalid timestamp is passed,
  //return the most recent available values
  const results =
    timestamp == null
      ? await graphQLClient.request(latestMetricsQuery)
      : await graphQLClient.request(query, {
          start: timestamp - 2 * 60 * 60 * 1000,
          end: timestamp,
        });
  return [
    //CLAM+ / Clam Pond
    {
      pool: '0xF2A8705D327534E334d09BC28e5C97b5c356Aa01',
      tvlUsd: parseFloat(
        results?.pearlBankMetrics?.[0].clamPondDepositedUsdValue
      ),
      apy: parseFloat(results?.pearlBankMetrics?.[0].apy),
      project: 'ottopia',
      symbol: 'CLAM+',
      chain: utils.formatChain('polygon'),
      rewardTokens: ['0xF2A8705D327534E334d09BC28e5C97b5c356Aa01'], //CLAM+
      underlyingTokens: ['0xF2A8705D327534E334d09BC28e5C97b5c356Aa01'], //CLAM+
    },
    //PEARL / Pearl Bank
    {
      pool: '0x845EB7730a8D37e8D190Fb8bb9c582038331B48a',
      tvlUsd: parseFloat(
        results?.pearlBankMetrics?.[0].pearlBankDepositedUsdValue
      ),
      apy: parseFloat(results?.pearlBankMetrics?.[0].apy),
      project: 'ottopia',
      symbol: 'PEARL',
      chain: utils.formatChain('polygon'),
      rewardTokens: ['0x236eec6359fb44cce8f97e99387aa7f8cd5cde1f'], //USD+
      underlyingTokens: ['0x845EB7730a8D37e8D190Fb8bb9c582038331B48a'], //PEARL
    },
  ];
}

const main = async (timestamp = null) => {
  const data = await Promise.all([tvl(timestamp)]);
  return data.flat();
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://ottopia.app/',
};
