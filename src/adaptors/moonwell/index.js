const utils = require('../utils');
const { request, gql, batchRequests } = require('graphql-request');

const API_URL =
  'https://api.thegraph.com/subgraphs/name/moonwell-fi/moonwell-moonbeam';
const query = gql`
  {
    markets {
      id
      borrowRate
      supplyRate
      totalBorrows
      totalSupply
      underlyingSymbol
      underlyingPriceUSD
      exchangeRate
      underlyingAddress
      collateralFactor
      supplyRewardNative
      supplyRewardProtocol
      borrowRewardNative
      borrowRewardProtocol
    }
  }
`;
const getApy = async () => {
  const res = await request(API_URL, query);
  return res.markets
    .map((pool) => {
      let price =
        pool.underlyingSymbol.toLowerCase() === 'usdc'
          ? 1
          : Number(pool.underlyingPriceUSD);
      if (price === 0 && pool.underlyingSymbol.toLowerCase() === 'weth') {
        const _price = res.markets.find(
          (e) => e.id === '0xaaa20c5a584a9fecdfedd71e46da7858b774a9ce'
        ).underlyingPriceUSD;
        price = Number(_price);
      }

      const tvlUsd =
        Number(pool.totalSupply) * Number(pool.exchangeRate) * price;
      const totalBorrowUsd = Number(pool.totalBorrows) * price;
      return {
        pool: pool.id.toLowerCase(),
        chain: utils.formatChain('moonbeam'),
        project: 'moonwell',
        symbol: pool.underlyingSymbol,
        tvlUsd,
        apyBase: Number(pool.supplyRate),
        apyReward:
          Number(pool.supplyRewardNative) + Number(pool.supplyRewardProtocol),
        underlyingTokens: [
          pool.underlyingAddress ===
          '0x0000000000000000000000000000000000000000'
            ? '0xAcc15dC74880C9944775448304B263D191c6077F'
            : pool.underlyingAddress,
        ],
        rewardTokens: [
          '0x511ab53f793683763e5a8829738301368a2411e3',
          '0xacc15dc74880c9944775448304b263d191c6077f',
        ],
        // borrow fields
        totalSupplyUsd: tvlUsd + totalBorrowUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(pool.borrowRate),
        apyRewardBorrow:
          Number(pool.borrowRewardNative) + Number(pool.borrowRewardProtocol),
        ltv: Number(pool.collateralFactor),
      };
    })
    .filter((e) => e.ltv);
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://moonwell.fi/artemis',
};
