const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const { chunkArray, calculateTrancheTotal } = require('./helpers');
const { getBlocksByTime, getData } = require('../utils');

const ADDRESSES = {
  base: {
    AvantisJuniorTranche: '0x944766f715b51967E56aFdE5f0Aa76cEaCc9E7f9',
    AvantisSeniorTranche: '0x83084cB182162473d6FEFfCd3Aa48BA55a7B66F7',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
};

const SUBGRAPH_URL =
  'https://subgraph.satsuma-prod.com/052b6e8d4af9/avantis/avantis-mainnet/version/v0.1.9/api';

const feeFetchCount = 10000;

const feeDistributedQuery = gql`
  query FeesDistributeds($first: Int!, $skip: Int!, $start: Int!, $end: Int!) {
    feesDistributeds(
      first: $first
      skip: $skip
      where: { timestamp_gte: $start, timestamp_lte: $end }
      orderBy: timestamp
      orderDirection: asc
    ) {
      id
    }
  }
`;

const vmToTrancheQuery = gql`
  query VmToTrancheTransfers($transactionHashes: [String!]!, $to: [String!]!) {
    vmtoTrancheTransfers(
      where: { transactionHash_in: $transactionHashes, to_in: $to }
    ) {
      value
      to
    }
  }
`;

const fetchFeeDistributedIds = async (timestamp, skip = 0) => {
  const { feesDistributeds } = await request(
    SUBGRAPH_URL,
    feeDistributedQuery,
    {
      first: feeFetchCount,
      skip: skip,
      start: timestamp - 7 * 86400,
      end: timestamp,
    }
  );

  let ids = feesDistributeds.map((f) => f.id);

  if (ids.length === feeFetchCount) {
    ids = ids.concat(
      await fetchFeeDistributedIds(timestamp, skip + feeFetchCount)
    );
  }

  return ids;
};

const fetchTransfersForFeeDistributedIds = async (ids) => {
  const chunkedIds = chunkArray(ids, 1000);

  let totalJunior = 0;
  let totalSenior = 0;

  for (const chunk of chunkedIds) {
    const { vmtoTrancheTransfers } = await request(
      SUBGRAPH_URL,
      vmToTrancheQuery,
      {
        transactionHashes: chunk,
        to: [
          ADDRESSES.base.AvantisJuniorTranche,
          ADDRESSES.base.AvantisSeniorTranche,
        ],
      }
    );

    totalJunior += calculateTrancheTotal(
      vmtoTrancheTransfers,
      ADDRESSES.base.AvantisJuniorTranche
    );
    totalSenior += calculateTrancheTotal(
      vmtoTrancheTransfers,
      ADDRESSES.base.AvantisSeniorTranche
    );
  }

  return { totalJunior: totalJunior / 7, totalSenior: totalSenior / 7 };
};

// NOTE: OUR SUBGRAPH IS NOT CAUGHT UP TO DATE, SO WE ARE USING THE API FOR NOW
// -----------------------------------------------------------------------------
// We will reenable time travel once our subgraph is caught up
const main = async (timestamp = null) => {
  // timestamp = timestamp ? parseInt(timestamp) : Math.floor(Date.now() / 1000);

  // NOTE: OUR SUBGRAPH IS NOT CAUGHT UP TO DATE, SO WE ARE USING THE API FOR NOW
  // -----------------------------------------------------------------------------
  // Get total fees distributed for junior and senior tranches
  // const feesDistributedIds = await fetchFeeDistributedIds(timestamp);
  // const { totalJunior, totalSenior } = await fetchTransfersForFeeDistributedIds(
  //   feesDistributedIds
  // );

  // const [block] = await getBlocksByTime([timestamp], 'base');

  const { meta } = await getData(
    'https://api.avantisfi.com/v1/vault/returns-7-days'
  );

  // Get TVL for junior and senior tranches
  let [juniorTvl, seniorTvl] = await Promise.all([
    sdk.api.abi.call({
      abi: 'erc20:balanceOf',
      target: ADDRESSES.base.USDC,
      params: [ADDRESSES.base.AvantisJuniorTranche],
      chain: 'base',
      // block: block,
    }),
    sdk.api.abi.call({
      abi: 'erc20:balanceOf',
      target: ADDRESSES.base.USDC,
      params: [ADDRESSES.base.AvantisSeniorTranche],
      chain: 'base',
      // block: block,
    }),
  ]);

  juniorTvl = juniorTvl.output / 1e6;
  seniorTvl = seniorTvl.output / 1e6;

  // Calculate daily returns for junior and senior tranches
  // const juniorDailyReturns = totalJunior / juniorTvl;
  // const seniorDailyReturns = totalSenior / seniorTvl;
  const juniorDailyReturns = meta.averageJrFees / juniorTvl;
  const seniorDailyReturns = meta.averageSrFees / seniorTvl;

  // Calculate APY for junior and senior tranches
  const juniorApy = (1 + juniorDailyReturns) ** 365 - 1;
  const seniorApy = (1 + seniorDailyReturns) ** 365 - 1;

  return [
    {
      pool: `AVANTIS-${ADDRESSES.base.AvantisJuniorTranche}-base`.toLowerCase(),
      chain: 'base',
      project: 'avantis',
      symbol: 'USDC',
      poolMeta: 'junior',
      tvlUsd: juniorTvl,
      apyBase: juniorApy * 100,
      url: 'https://www.avantisfi.com/earn/junior',
    },
    {
      pool: `AVANTIS-${ADDRESSES.base.AvantisSeniorTranche}-base`.toLowerCase(),
      chain: 'base',
      project: 'avantis',
      symbol: 'USDC',
      poolMeta: 'senior',
      tvlUsd: seniorTvl,
      apyBase: seniorApy * 100,
      url: 'https://www.avantisfi.com/earn/senior',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
};
