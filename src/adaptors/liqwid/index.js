const { request, gql } = require('graphql-request');
const fetch = require('node-fetch');

const apy = async () => {
  const endpoint = 'https://v2.api.liqwid.finance/graphql';
  const registryEndpoint = 'https://public.liqwid.finance/registry.json';

  const query = gql`
    query {
      liqwid {
        data {
          markets {
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
            }
          }
        }
      }
    }
  `;

  const data = await request(endpoint, query);

  //NOTE: Action validator will be added to the API in the near future
  const registryData = await fetch(registryEndpoint)
    .then((res) => res.json())
    .then((data) =>
      data.scriptInfos.filter(
        (script) =>
          script.type === 'Validator' && script.tag === 'liqwidMainnet'
      )
    );

  // These are the markets that are either disabled or not borrowable, so no yield can be generated
  const disableMarkets = [
    'AGIX',
    'WMT',
    'POL',
    'LQ'
  ]

  const markets =
    data.liqwid.data.markets.results
      .filter((market) => !disableMarkets.includes(market.id));

  const getPool = (market) => {
    return {
      pool: registryData.find(
        (script) => script.name === `Liqwid${market.id}Action`
      ).scriptHash,
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

  return markets.map(getPool);
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://v2.liqwid.finance/',
};
