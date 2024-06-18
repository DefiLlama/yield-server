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
const { getUmamiGlpVaultsYield } = require('./umamiGlpVaults.js');
const { getUmamiGmVaultsYield } = require('./umamiGmVaults.js');

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
    apyBase: +metrics[0].value,
    symbol: 'mUMAMI',
    rewardTokens: [wETH_ADDRESS],
    underlyingTokens: [UMAMI_ADDRESS],
    url: 'https://umami.finance/marinate',
  };

  const cmUMAMI = {
    pool: cmUMAMI_ADDRESS,
    tvlUsd: +(parseFloat(compounding) * umamiPriceUSD),
    apyBase: +metrics[1].value,
    symbol: 'cmUMAMI',
    rewardTokens: [UMAMI_ADDRESS],
    underlyingTokens: [UMAMI_ADDRESS],
    url: 'https://umami.finance/marinate',
  };

  const [glpVaults, gmVaults] = await Promise.all([
    getUmamiGlpVaultsYield(),
    getUmamiGmVaultsYield(),
  ]);

  return [mUMAMI, cmUMAMI, ...glpVaults, ...gmVaults].map((strat) => ({
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
