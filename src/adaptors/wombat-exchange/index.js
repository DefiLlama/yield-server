const { util } = require('@defillama/sdk');
const { gql, request } = require('graphql-request');

const BLOCK_API =
  'https://api.thegraph.com/subgraphs/name/matthewlilley/bsc-blocks';

const VOLUMES_API =
  'https://api.thegraph.com/subgraphs/name/wombat-exchange/wombat-exchange';

const APR_API =
  'https://api.thegraph.com/subgraphs/name/corey-wombat/wombat-median-apr';

const prevBlockQuery = gql`
  query Blocks($timestamp_lte: BigInt = "") {
    blocks(
      first: 1
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: $timestamp_lte }
    ) {
      number
      timestamp
    }
  }
`;

const volumesQuery = gql`
  query Volumes($block: Int = 0) {
    tokensNow: tokens {
      id
      symbol
      totalTradeVolume
      liabilityUSD
    }
    tokens24hAgo: tokens(block: { number: $block }) {
      id
      symbol
      totalTradeVolume
    }
  }
`;

const aprQuery = gql`
  query Apr {
    assets {
      id
      symbol
      medianBoostedAPR
      underlyingToken {
        id
      }
    }
  }
`;

const FEE = 0.001;

const oneDay = 86400;

const apy = async () => {
  const timestampPrior = +(new Date() / 1000).toFixed(0) - oneDay;

  const blockPrior = (
    await request(BLOCK_API, prevBlockQuery, {
      timestamp_lte: timestampPrior,
    })
  ).blocks[0].number;

  const { tokensNow, tokens24hAgo } = await request(VOLUMES_API, volumesQuery, {
    block: +blockPrior,
  });

  const { assets: aprs } = await request(APR_API, aprQuery);

  const pools = tokensNow.map((pool) => {
    const aprData =
      aprs.find((apr) => apr.underlyingToken.id === pool.id) || {};

    let apyReward = Number(aprData.medianBoostedAPR);
    apyReward = pool.symbol.toLowerCase().includes('bnb')
      ? apyReward
      : apyReward * 100;

    return {
      pool: aprData.id,
      project: 'wombat-exchange',
      chain: 'Binance',
      tvlUsd: Number(pool.liabilityUSD) || 0,
      symbol: pool.symbol,
      apyReward,
      underlyingTokens: [pool.id],
      rewardTokens: [
        '0xAD6742A35fB341A9Cc6ad674738Dd8da98b94Fb1', // WOM
      ],
    };
  });

  return pools;
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.wombat.exchange/pool',
};
