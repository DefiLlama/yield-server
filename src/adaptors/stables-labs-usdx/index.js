const { gql } = require('graphql-request');
const utils = require('../utils');
const fetch = require('node-fetch');

const USDX = '0xf3527ef8dE265eAa3716FB312c12847bFBA66Cef';

const poolsFunction = async (chainString, subgraphUrl, token) => {
  const query = `
      query {
        rewardAccumulations(first: 1) {
            id
            totalAmount
            totalAssets
            lastRewardTime
            apy
        }
      }
    `;

  let apyData = {
    tvl: 0,
    deposit_apy: 0,
  };

  try {
    const response = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const { data } = await response.json();
    const { rewardAccumulations } = data;
    apyData.deposit_apy = rewardAccumulations[0].apy;
    apyData.tvl = rewardAccumulations[0].totalAssets;
  } catch (err) {
    console.log('Error fetching token prices:', err);
    return {};
  }

  const usdxPool = {
    pool: `${token}-${chainString.toLowerCase()}`,
    symbol: 'USDX',
    project: 'stables-labs-usdx',
    chain: chainString,
    tvlUsd: Number(apyData.tvl) / 1e18,
    apyBase: Number(apyData.deposit_apy) * 100,
    poolMeta: '7 days unstaking',
    underlyingTokens: [token],
  };

  return usdxPool;
};

const main = async () => {
  const data = await Promise.all([
    poolsFunction(
      'Ethereum',
      'https://api.studio.thegraph.com/query/96429/usdx-subgraph-ethereum/version/latest',
      '0xf3527ef8dE265eAa3716FB312c12847bFBA66Cef'
    ),
    poolsFunction(
      'Arbitrum',
      'https://api.studio.thegraph.com/query/96429/usdx-subgraph-arbitrum/version/latest',
      '0xf3527ef8dE265eAa3716FB312c12847bFBA66Cef'
    ),
    poolsFunction(
      'Bsc',
      'https://api.studio.thegraph.com/query/96429/usdx-subgraph-bsc/version/latest',
      '0xf3527ef8dE265eAa3716FB312c12847bFBA66Cef'
    ),
  ]);
  return data;
};

module.exports = {
  apy: main,
  url: 'https://app.usdx.money/',
};
