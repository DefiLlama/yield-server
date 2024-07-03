const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const utils = require('../utils');

const GFI_ADDRESS = '0xdab396cCF3d84Cf2D07C4454e10C8A6F5b008D2b';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const SENIOR_POOL_ADDRESS = '0x8481a6EbAf5c7DABc3F7e09e44A89531fd31F822';

const API_URL = sdk.graph.modifyEndpoint('G9N1RFta3jbpPNmeGxSJoMVBZUJeG1jiSxUfYG29UQHj');

const apyQuery = gql`
  query {
    seniorPools {
      estimatedApy
      estimatedApyFromGfiRaw
      assets
    }
  }
`;

const GFI = '0xdab396ccf3d84cf2d07c4454e10c8a6f5b008d2b';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
async function apy() {
  const prices = (
    await axios.get(
      `https://coins.llama.fi/prices/current/ethereum:${GFI},ethereum:${USDC}`
    )
  ).data.coins;

  const { seniorPools } = await request(API_URL, apyQuery);
  const { estimatedApy, estimatedApyFromGfiRaw, assets } = seniorPools[0];
  const tvlUsd =
    new BigNumber(assets).dividedBy(1e6).toNumber() *
    prices[`ethereum:${USDC}`].price;

  return [
    {
      pool: SENIOR_POOL_ADDRESS,
      chain: utils.formatChain('ethereum'),
      project: 'goldfinch',
      symbol: 'USDC',
      tvlUsd,
      apyBase: parseFloat(estimatedApy) * 100,
      apyReward:
        parseFloat(estimatedApyFromGfiRaw) *
        prices[`ethereum:${GFI}`].price *
        100,
      underlyingTokens: [USDC_ADDRESS],
      rewardTokens: [GFI_ADDRESS],
      // borrow fields
      ltv: 0, // permissioned
    },
  ];
}

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://beta.app.goldfinch.finance/earn',
};
