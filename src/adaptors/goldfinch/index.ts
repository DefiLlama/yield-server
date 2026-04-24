const BigNumber = require('bignumber.js');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const utils = require('../utils');

const SENIOR_POOL_ADDRESS = '0x8481a6EbAf5c7DABc3F7e09e44A89531fd31F822';
const GFI_ADDRESS = '0xdab396cCF3d84Cf2D07C4454e10C8A6F5b008D2b';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_cmgz2qi2d003xxhp2eqgwfd5o/subgraphs/goldfinch-v2/annual_brown_worm/gn';

const apyQuery = gql`
  query {
    seniorPools {
      estimatedApy
      estimatedApyFromGfiRaw
      assets
    }
  }
`;

async function apy() {
  const priceResponse = await axios.get(
    `https://coins.llama.fi/prices/current/ethereum:${USDC_ADDRESS},ethereum:${GFI_ADDRESS}`
  );
  const prices = priceResponse.data.coins;
  const usdcPrice = prices[`ethereum:${USDC_ADDRESS}`].price;
  const gfiPrice = prices[`ethereum:${GFI_ADDRESS}`]?.price || 0;

  const { seniorPools } = await request(SUBGRAPH_URL, apyQuery);
  const { estimatedApy, estimatedApyFromGfiRaw, assets } = seniorPools[0];

  const tvlUsd = new BigNumber(assets).dividedBy(1e6).times(usdcPrice).toNumber();

  const apyBase = parseFloat(estimatedApy) * 100;

  const gfiApyRaw = parseFloat(estimatedApyFromGfiRaw);
  const apyReward = gfiApyRaw > 0 ? gfiApyRaw * gfiPrice * 100 : null;

  const pool = {
    pool: SENIOR_POOL_ADDRESS,
    chain: utils.formatChain('ethereum'),
    project: 'goldfinch',
    symbol: 'USDC',
    tvlUsd,
    apyBase,
    underlyingTokens: [USDC_ADDRESS],
    apyReward: apyReward,
    rewardTokens: [GFI_ADDRESS],
    ltv: 0, // permissioned protocol - only accredited investors
  };

  return [pool];
}

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.goldfinch.finance/pools/senior',
};
