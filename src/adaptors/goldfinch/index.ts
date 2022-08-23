const BigNumber = require('bignumber.js');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

const GFI_ADDRESS = '0xdab396cCF3d84Cf2D07C4454e10C8A6F5b008D2b';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const SENIOR_POOL_ADDRESS = '0x8481a6EbAf5c7DABc3F7e09e44A89531fd31F822';

const API_URL =
  'https://api.thegraph.com/subgraphs/name/goldfinch-eng/goldfinch-v2';

const apyQuery = gql`
  query {
    seniorPoolStatus(id: 1) {
      estimatedApy
      estimatedApyFromGfiRaw
      totalPoolAssetsUsdc
    }
  }
`;
async function apy() {
  const { seniorPoolStatus } = await request(API_URL, apyQuery);
  const { estimatedApy, estimatedApyFromGfiRaw, totalPoolAssetsUsdc } =
    seniorPoolStatus;
  const tvlUsd = new BigNumber(totalPoolAssetsUsdc).dividedBy(1e6).toNumber();

  return [
    {
      pool: SENIOR_POOL_ADDRESS,
      chain: utils.formatChain('ethereum'),
      project: 'goldfinch',
      symbol: 'USDC',
      tvlUsd,
      apyBase: parseFloat(estimatedApy) * 100,
      apyReward: parseFloat(estimatedApyFromGfiRaw) * 100,
      underlyingTokens: [USDC_ADDRESS],
      rewardTokens: [GFI_ADDRESS],
    },
  ];
}

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://beta.app.goldfinch.finance/earn',
};
