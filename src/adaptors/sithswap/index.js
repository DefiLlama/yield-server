const { request, gql } = require('graphql-request');

const utils = require('../utils');

const API_URL = 'https://api.sithswap.info/';
const FEE_PRECISION = 1000000;

const pairsDataQuery = gql`
  {
    pairs(first: 10, orderBy: totalValueLockedUSD, orderDirection: desc, where: {totalValueLockedUSD_gt: 10000}) {
      id
      totalValueLockedUSD
      feeTier
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;

const dayDataQuery = gql`
  {
    pairdaydatas(first: 1, skip:1,  orderBy: date orderDirection: desc, where:{pair_in: "<PLACEHOLDER>"}) { 
      id 
      dailyVolumeUSD 
    }
  }
`;
const getApy = async () => {
  // APR is retrieved using our api, tvl pairs etc trough subgraph
  const { pairs: pairs } = await request(API_URL, pairsDataQuery,);

  const poolInfo = await Promise.all(
    pairs.map(async (pool) => {
      const underlyingTokens = [pool.token0.id, pool.token1.id];
      const symbol = utils.formatSymbol(`${pool.token0.symbol}-${pool.token1.symbol}`)
      const { pairdaydatas: pairDayData } = await request(API_URL, dayDataQuery.replace('<PLACEHOLDER>', pool.id),);
      const dailyFee = pairDayData[0] ? pairDayData[0].dailyVolumeUSD * pool.feeTier / FEE_PRECISION : 0
      const apy = (dailyFee * 36500) / pool.totalValueLockedUSD;
      const url = `https://app.sithswap.com/add/${pool.id}`;
      return {
        pool: pool.id,
        chain: 'starknet',
        project: 'sithswap',
        symbol,
        tvlUsd: Number(pool.totalValueLockedUSD),
        apyBase: apy,
        underlyingTokens,
        url
      };
    })
  );
  return poolInfo;

};

async function main() {
  let data = await getApy();
  return data;
}

module.exports = {
  timetravel: false,
  apy: main,
};

