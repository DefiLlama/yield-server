const { request, gql } = require('graphql-request');
const fetch = require('node-fetch');

const apy = async () => {
  const endpoint = 'https://v2.api.liqwid.finance/graphql';

  const query = gql`
    query {
      liqwid {
        data {
          markets (input: { perPage: 100 }) {
            page
            results {
              id
              supplyAPY
              supply
              liquidity
              lqSupplyAPY
              borrowAPY
              borrow
              utilization
              asset {
                price
              }
              registry {
                actionScriptHash
              }
            }
          }
        }
      }
    }
  `;

  const data = await request(endpoint, query);

  // These are the markets that are either disabled or not borrowable, so no yield can be generated
  const disableMarkets = ['AGIX', 'WMT', 'POL', 'LQ'];

  const markets = data.liqwid.data.markets.results.filter(
    (market) => !disableMarkets.includes(market.id)
  );

  const getPool = (market) => {
    return {
      pool: market.registry.actionScriptHash,
      chain: 'Cardano',
      project: 'liqwid',
      symbol: market.id,
      tvlUsd: market.liquidity * market.asset.price,
      apyReward:
        market.lqSupplyAPY * 100 > 100
          ? market.lqSupplyAPY
          : market.lqSupplyAPY * 100,
      apyBase: market.supplyAPY * 100,
      rewardTokens: [market.id, 'LQ'],
      underlyingTokens: [market.id],
      apyBaseBorrow:
        market.borrowAPY * 100 > 100
          ? market.borrowAPY
          : market.borrowAPY * 100,
      totalSupplyUsd: market.supply * market.asset.price,
      totalBorrowUsd: market.borrow * market.asset.price,
    };
  };

  return markets.map(getPool).filter((i) => i.pool !== undefined);
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://v2.liqwid.finance/',
};
