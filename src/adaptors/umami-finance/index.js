const superagent = require('superagent');
const axios = require('axios');
const { request, gql } = require('graphql-request');
const {
  UMAMI_ADDRESS,
  mUMAMI_ADDRESS,
  cmUMAMI_ADDRESS,
  UMAMI_GRAPH_URL,
  UMAMI_API_URL,
  wETH_ADDRESS,
} = require('./umamiConstants.js');
const { getUmamiGmSynthsVaultsYield } = require('./umamiGmSynthVaults.js');
const { getUmamiGmVaultsYield } = require('./umamiGmVaults.js');

const main = async () => {
  const [synthGmVaults, gmVaults] = await Promise.all([
    getUmamiGmSynthsVaultsYield(),
    getUmamiGmVaultsYield(),
  ]);

  return [...synthGmVaults, ...gmVaults].map((strat) => ({
    ...strat,
    chain: 'Arbitrum',
    project: 'umami-finance',
  }));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://umami.finance/',
};
