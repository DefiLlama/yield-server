const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk3');
const axios = require('axios');

const utils = require('../utils');
const abi = require('./abi');

const subgraph =
  'https://api.thegraph.com/subgraphs/name/saddle-finance/saddle';

const apy = async () => {
  const q = gql`
    query MyQuery {
      dailyVolumes(orderBy: timestamp, orderDirection: desc) {
        id
        timestamp
        volume
        swap {
          id
          lpToken
          swapFee
          virtualPrice
          withdrawFee
          tokens {
            symbol
            address
            decimals
          }
        }
      }
    }
  `;
  const dailyVolume = (await request(subgraph, q)).dailyVolumes;
  // filter to most recent values per pool
  let pools = dailyVolume.filter(
    (obj, index, self) =>
      index === self.findIndex((t) => t.swap.id === obj.swap.id)
  );

  // get prices
  const uniqueTokens = [
    ...new Set(
      pools.map((p) => p.swap.tokens.map((t) => t.address.toLowerCase())).flat()
    ),
  ]
    .map((t) => `ethereum:${t}`)
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${uniqueTokens}`)
  ).data.coins;

  const finalPools = await Promise.all(
    pools.map(async (p, i) => {
      const tokenAddresses = (
        await sdk.api.abi.multiCall({
          calls: p.swap.tokens.map((_, j) => ({
            target: p.swap.id,
            params: [j],
          })),
          chain: 'ethereum',
          abi: abi.find((m) => m.name === 'getToken'),
        })
      ).output.map((o) => o.output);

      const tokenBalances = (
        await sdk.api.abi.multiCall({
          calls: p.swap.tokens.map((_, j) => ({
            target: p.swap.id,
            params: [j],
          })),
          chain: 'ethereum',
          abi: abi.find((m) => m.name === 'getTokenBalance'),
        })
      ).output.map((o) => o.output);

      const tvlUsd = tokenAddresses.reduce((acc, t, i) => {
        const tokenPrice = prices[`ethereum:${t.toLowerCase()}`]?.price;
        const tokenDecimals = p.swap.tokens.find(
          (token) => token.address.toLowerCase() === t.toLowerCase()
        )?.decimals;
        return acc + (tokenPrice * tokenBalances[i]) / 10 ** tokenDecimals;
      }, 0);

      const apr = ((365 * p.volume * (p.swap.swapFee / 1e10)) / tvlUsd) * 100;

      return {
        pool: p.swap.id,
        symbol: p.swap.tokens.map((t) => t.symbol).join('-'),
        chain: 'Ethereum',
        project: 'saddle-finance',
        tvlUsd,
        apyBase: utils.aprToApy(apr),
        underlyingTokens: p.swap.tokens.map((t) => t.address),
      };
    })
  );

  return finalPools.filter(
    (p) =>
      utils.keepFinite(p) &&
      p.pool !== '0x4f6a43ad7cba042606decaca730d4ce0a57ac62e' // ren pool
  );
};

module.exports = {
  apy,
  url: 'https://saddle.exchange/#/pools',
};
