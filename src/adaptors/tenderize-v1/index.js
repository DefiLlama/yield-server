const { GraphQLClient, gql } = require('graphql-request');
const utils = require('../utils');
const fetch = require('node-fetch');

const ethereumEndpoint =
  'https://api.thegraph.com/subgraphs/name/tenderize/tenderize-ethereum';
const arbitrumEndpoint =
  'https://api.thegraph.com/subgraphs/name/tenderize/tenderize-arbitrum';

const query = gql`
  {
    configs {
      id
      tenderToken
      tenderSwap
      tenderizer
      steak
    }
    tokens {
      id
      symbol
      address
    }
    tenderizers {
      id
      TVL
    }
  }
`;

const topLvl = async (endpoint, chain, apyResponse) => {
  const graphQLClient = new GraphQLClient(endpoint);
  const result = await graphQLClient.request(query);

  const { configs, tokens, tenderizers } = result;
  const pools = [];
  for (const config of configs) {
    pools.push({
      pool: `tenderize-${config.tenderToken}`,
      chain: utils.formatChain(chain),
      project: 'tenderize-v1',
      symbol: tokens.find((v) => v.address === config.tenderToken).symbol,
      tvlUsd: Number.parseFloat(
        tenderizers.find((v) => v.id === config.id).TVL
      ),
      apy: Number.parseFloat(apyResponse[config.id.toLowerCase()].apy),
    });
  }

  return pools;
};

const main = async () => {
  const resp = await fetch('https://v1.tenderize.me/api/apy', {
    headers: {
      accept: '*/*',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    },
    method: 'GET',
  });

  const apyResponse = await resp.json();

  const data = await Promise.all([
    topLvl(ethereumEndpoint, 'Ethereum', apyResponse),
    topLvl(arbitrumEndpoint, 'Arbitrum', apyResponse),
  ]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.tenderize.me/stakers/livepeer',
};
