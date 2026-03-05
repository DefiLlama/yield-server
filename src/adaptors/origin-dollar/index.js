const axios = require('axios');
const { gql, request } = require('graphql-request');
const sdk = require('@defillama/sdk');

const OUSD = '0x2A8e1E676Ec238d8A992307B495b45B3fEAa5e86';
const graphUrl = 'https://origin.squids.live/origin-squid/graphql';

const apy = async () => {
  const query = gql`
    query OTokenApy($chainId: Int!, $token: String!) {
      oTokenApies(
        limit: 1
        orderBy: timestamp_DESC
        where: { chainId_eq: $chainId, otoken_containsInsensitive: $token }
      ) {
        apy7DayAvg
        apy14DayAvg
        apy30DayAvg
        apr
        apy
      }
    }
  `;

  const variables = {
    token: OUSD,
    chainId: 1,
  };

  const apy =
    (await request(graphUrl, query, variables)).oTokenApies[0].apy7DayAvg * 100;

  const totalSupply =
    (
      await sdk.api.abi.call({
        target: OUSD,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const priceKey = `ethereum:${OUSD}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const ousd = {
    pool: OUSD,
    chain: 'Ethereum',
    project: 'origin-dollar',
    symbol: 'OUSD',
    tvlUsd: totalSupply * price,
    apy,
    underlyingTokens: [
      '0xdac17f958d2ee523a2206206994597c13d831ec7',
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      '0x6b175474e89094c44da98b954eedeac495271d0f',
    ],
    url: 'https://originprotocol.eth.limo/#/ousd',
  };

  return [ousd];
};

module.exports = {
  timetravel: false,
  apy,
};
