const { request, gql } = require('graphql-request');

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
              lqSupplyAPY
              borrowAPY
              borrow
              utilization
              asset {
                price
                symbol
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

  const markets = data.liqwid.data.markets.results;

  const getPool = (market) => {
    return {
      pool: registryData.find(
        (script) => script.name === `Liqwid${market.id}Action`
      ).scriptHash,
      chain: 'Cardano',
      project: 'liqwid',
      symbol: market.asset.symbol,
      tvlUsd: market.supply * market.asset.price,
      apyBase: market.supplyAPY,
      //NOTE: current API retrieves APY in fraction format but will be changed to percentage in the future
      apyReward:
        market.lqSupplyAPY * 100 > 100
          ? market.lqSupplyAPY
          : market.lqSupplyAPY * 100,
      rewardTokens: [market.asset.symbol, 'LQ'],
      underlyingTokens: [market.asset.symbol],
      // lending protocol fields
      apyBaseBorrow: market.borrowAPY,
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
