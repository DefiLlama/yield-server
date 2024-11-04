const { gql, request } = require('graphql-request');
const config = require('./config.js');

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
    assetsNow: assets {
      id
      symbol
      totalSharedFeeUSD
      liabilityUSD
    }
    assets24hAgo: assets(block: { number: $block }) {
      id
      symbol
      totalSharedFeeUSD
      liabilityUSD
    }
  }
`;

const aprQuery = gql`
  query Apr {
    assets(where: { id_not: "0x0000000000000000000000000000000000000000" }) {
      id
      symbol
      liabilityUSD
      totalSharedFeeUSD
      womBaseApr
      avgBoostedApr
      totalBonusTokenApr
      underlyingToken {
        id
      }
    }
  }
`;

const oneDay = 86400;

const apy = async () => {
  apy_export = [];
  for (chain in config) {
    const timestampPrior = +(new Date() / 1000).toFixed(0) - oneDay;

    const blockPrior = (
      await request(config[chain]['BLOCK_ENDPOINT'], prevBlockQuery, {
        timestamp_lte: timestampPrior,
      })
    ).blocks[0].number;

    const { assetsNow, assets24hAgo } = await request(
      config[chain]['APR_ENDPOINT'],
      volumesQuery,
      {
        block: +blockPrior,
      }
    );

    const { assets: aprs } = await request(
      config[chain]['APR_ENDPOINT'],
      aprQuery
    );

    const assets = aprs.map((pool) => {
      const aprData = aprs.find((apr) => apr.id === pool.id) || {};
      const feeNow = assetsNow.find((apr) => apr.id === pool.id) || {};
      const fee24hAgo = assets24hAgo.find((apr) => apr.id === pool.id) || {};

      // Projected baseApy estimated by feeUSD collected in 24h
      let apyBase =
        (((Number(feeNow.totalSharedFeeUSD) -
          Number(fee24hAgo.totalSharedFeeUSD)) /
          2) *
          365 *
          100) /
          Number(pool.liabilityUSD) || 0;

      let apyReward =
        (Number(aprData.womBaseApr) + Number(aprData.totalBonusTokenApr)) * 100;

      apy_export.push({
        pool: aprData.id,
        project: 'wombat-exchange',
        chain: chain,
        tvlUsd: Number(pool.liabilityUSD) || 0,
        symbol: pool.symbol,
        apyReward,
        apyBase,
        underlyingTokens: [pool.underlyingToken.id],
        rewardTokens: [config[chain]['WOM_ADDRESS']],
      });
    });
  }

  // remove dupes on lptoken
  return apy_export.filter(
    (v, i, a) => a.findIndex((v2) => v2.pool === v.pool) === i
  );
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.wombat.exchange/pool',
};
