const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { request, gql } = require('graphql-request');

const API_URL = `https://www.fenixfinance.io/api/blaze/liquidity/rewards`;

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_clxadvm41bujy01ui2qalezdn/subgraphs/fenix-v2-subgraph/latest/gn';

const FNX_ADDRESS = '0x52f847356b38720B55ee18Cb3e094ca11C85A192';

const swapPairsQuery = (skip) => {
  return gql`
    query MyQuery {
      pairs(first: 100, skip: ${skip}, where: {reserveUSD_gt: 10000}) {
        reserve0
        reserve1
        token1 {
          id
          symbol
        }
        token0 {
          id
          symbol
        }
        reserveUSD
        id
      }
    }
  `;
};

const getPairs = async () => {
  let pairs = [];
  let index = 0;
  let res;
  do {
    res = await request(SUBGRAPH_URL, swapPairsQuery(index), {});
    if (res.pairs.length > 0) {
      pairs = [...pairs, ...res.pairs];
    }
    index += res.pairs.length;
  } while (res.pairs.length > 0);
  return pairs;
};

const getApy = async () => {
  const pairs = await getPairs();
  const poolsRes = await axios.get(
    `${API_URL}?${pairs.map((pair) => `pools=${pair.id}`).join('&')}`
  );

  // First get FNX price from DeFiLlama
  const { coins: fnxPrice } = await utils.getData(
    `https://coins.llama.fi/prices/current/blast:${FNX_ADDRESS}?searchWidth=4h`
  );

  const fnxPriceUsd = fnxPrice[`blast:${FNX_ADDRESS}`]?.price || 0;

  // Create apyDict by calculating (rewards/tvl) * 100 * 52 for each pool
  const apyDict = {};
  for (const pool of poolsRes.data) {
    const pairData = pairs.find(
      (p) => p.id.toLowerCase() === pool.pool.toLowerCase()
    );

    if (pairData) {
      // Convert reward to annual value (weekly * 52) and from Wei to FNX
      const annualReward = (parseFloat(pool.rewardWei) * 52) / 1e18;
      // Convert to USD using FNX price
      const annualRewardUSD = annualReward * fnxPriceUsd;
      // Get TVL
      const tvl = parseFloat(pairData.reserveUSD);
      // Calculate APY: (annual reward in USD / TVL) * 100
      apyDict[pool.pool.toLowerCase()] = (annualRewardUSD / tvl) * 100;
    }
  }

  const pools = pairs.map((pair) => {
    tvl = parseFloat(pair.reserveUSD);
    return {
      pool: pair.id,
      chain: utils.formatChain('blast'),
      project: 'fenix-standard-pools',
      symbol: `${pair.token0.symbol}-${pair.token1.symbol}`,
      tvlUsd: tvl,
      apyReward: parseFloat(apyDict[pair.id.toLowerCase()] || 0),
      underlyingTokens: [pair.token0.id, pair.token1.id],
      rewardTokens: [FNX_ADDRESS],
    };
  });

  return pools;
};
getApy();
module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://www.fenixfinance.io/liquidity',
};
