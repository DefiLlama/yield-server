const { default: request, gql } = require('graphql-request');
const axios = require('axios');

const chain = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
  1313161554: 'aurora',
  25: 'cronos',
  324: 'zksync_era',
  5000: 'mantle',
};

const query = gql`
  query Pools {
    pools(filter:{
      poolStatus: "Active",
      auditStatus: "Approved"
    }){
      poolsInfo {
        id
        productInfo{
          name
          chainId
        }
        currencyInfo{
          symbol
          currencyAddress
          decimals
        }
        issuerInfo {
          accountInfo{
            username
          }
        }
        poolOrderInfo{
          poolId
        }
        aum
        apy
      }
    }
  }
`;

const poolsFunction = async () => {
  const headers = { 'Authorization': 'solv' }
  const data = (await request("https://sft-api.com/graphql", query, null, headers)).pools;

  const pricesArray = data.poolsInfo.map((t) => `${chain[t.productInfo.chainId]}:${t.currencyInfo.currencyAddress}`);
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
  ).data.coins;

  let ustPool = [];
  for (const pool of data.poolsInfo) {
    ustPool.push({
      pool: `${pool.poolOrderInfo.poolId.toLowerCase()}-${chain[pool.productInfo.chainId]}`,
      chain: chain[pool.productInfo.chainId],
      project: `solv-funds`,
      symbol: pool.currencyInfo.symbol,
      underlyingTokens: [pool.currencyInfo.currencyAddress],
      tvlUsd: Number(pool.aum * prices[`${chain[pool.productInfo.chainId]}:${pool.currencyInfo.currencyAddress}`].price),
      apy: Number(pool.apy / 100),
      url: `https://app.solv.finance/earn/open-fund/detail/${pool.id}`
    })
  }

  return ustPool; // Anchor only has a single pool with APY
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.solv.finance/',
};