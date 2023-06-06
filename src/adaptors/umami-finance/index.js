const superagent = require('superagent');
const axios = require('axios');
const { request, gql } = require('graphql-request');

const UMAMI_GRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/umamidao/protocol-metrics';
const UMAMI_API_URL = 'https://api.umami.finance/api/v2';
const UMAMI_ADDRESS = '0x1622bf67e6e5747b81866fe0b85178a93c7f86e3';
const mUMAMI_ADDRESS = '0x2adabd6e8ce3e82f52d9998a7f64a90d294a92a4';
const cmUMAMI_ADDRESS = '0x1922c36f3bc762ca300b4a46bb2102f84b1684ab';

const tokenSupplyQuery = gql`
  {
    supplyBreakdowns(first: 1, orderBy: block, orderDirection: desc) {
      marinating
      compounding
    }
  }
`;

const main = async () => {
  const key = `arbitrum:${UMAMI_ADDRESS}`.toLowerCase();
  const umamiPriceUSD = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins[key].price;

  const data = await request(UMAMI_GRAPH_URL, tokenSupplyQuery);
  const { marinating, compounding } = data.supplyBreakdowns[0];

  const {
    data: { metrics },
  } = await axios.get(
    `${UMAMI_API_URL}/staking/metrics/current?keys=apr&keys=apy`
  );

  const mUMAMI = {
    pool: mUMAMI_ADDRESS,
    tvlUsd: +(parseFloat(marinating) * umamiPriceUSD),
    apy: +metrics[0].value,
    symbol: 'UMAMI',
  };

  const cmUMAMI = {
    pool: cmUMAMI_ADDRESS,
    tvlUsd: +(parseFloat(compounding) * umamiPriceUSD),
    apy: +metrics[1].value,
    symbol: 'mUMAMI',
  };

  return [mUMAMI, cmUMAMI].map((strat) => ({
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
