const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { request, gql } = require('graphql-request');

const API_URL = `https://www.fenixfinance.io/api/blaze/liquidity/rewards`;

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_clxadvm41bujy01ui2qalezdn/subgraphs/fenix-v3-dex/latest/gn';

const FNX_ADDRESS = '0x52f847356b38720B55ee18Cb3e094ca11C85A192';

const swapPairsQuery = (skip) => {
  return gql`
    query MyQuery {
      pools(first: 100, skip: ${skip}, where: {totalValueLockedUSD_gt: 10000}) {
       totalValueLockedToken0
       totalValueLockedToken1
       totalValueLockedUSD
        token1 {
          id
          symbol
        }
        token0 {
          id
          symbol
        }
        id
      }
    }
  `;
};

const getPairs = async () => {
  try {
    let pools = [];
    let index = 0;
    let res;

    do {
      res = await request(SUBGRAPH_URL, swapPairsQuery(index), {});

      if (res.pools?.length > 0) {
        pools = [...pools, ...res.pools];
      }
      index += res.pools?.length || 0;
    } while (res.pools?.length > 0);

    return pools;
  } catch (error) {
    console.error('Error in getPairs:', error);
    throw error;
  }
};

const getApy = async () => {
  try {
    const pairs = await getPairs();

    const poolsRes = await axios.get(
      `${API_URL}?${pairs.map((pair) => `pools=${pair.id}`).join('&')}`
    );
    // console.log('Pools rewards sample:', poolsRes.data);

    const { coins: fnxPrice } = await utils.getData(
      `https://coins.llama.fi/prices/current/blast:${FNX_ADDRESS}?searchWidth=4h`
    );
    const fnxPriceUsd = fnxPrice[`blast:${FNX_ADDRESS}`]?.price || 0;

    const apyDict = {};
    for (const pool of poolsRes.data) {
      const pairData = pairs.find(
        (p) => p.id.toLowerCase() === pool.pool.toLowerCase()
      );

      if (pairData) {
        const weeklyRewardInFNX = parseFloat(pool.rewardWei) / 1e18;
        const annualRewardInFNX = weeklyRewardInFNX * 52;
        const annualRewardUSD = annualRewardInFNX * fnxPriceUsd;
        const tvl = parseFloat(pairData.totalValueLockedUSD);
        apyDict[pool.pool.toLowerCase()] = (annualRewardUSD / tvl) * 100;
      }
    }

    const pools = pairs.map((pair) => {
      let tvl = parseFloat(pair.totalValueLockedUSD);

      const poolData = {
        pool: pair.id,
        chain: utils.formatChain('blast'),
        project: 'fenix-concentrated-liquidity',
        symbol: `${pair.token0.symbol}-${pair.token1.symbol}`,
        tvlUsd: tvl,
        apyReward: parseFloat(apyDict[pair.id.toLowerCase()] || 0),
        underlyingTokens: [pair.token0.id, pair.token1.id],
        rewardTokens: [FNX_ADDRESS],
      };

      return poolData;
    });
    return pools;
  } catch (error) {
    console.error('Error in getApy:', error);
    throw error;
  }
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://www.fenixfinance.io/liquidity',
};
