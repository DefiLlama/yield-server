const { request, gql } = require('graphql-request');

const LQ_TOKEN_ID =
  'da8c30857834c6ae7203935b89278c532b3995245295456f993e1d244c51';
const ADA_TOKEN_ID = 'lovelace';

const getUnderlyingToken = (market) => {
  if (market.asset?.id) return market.asset.id;
  if (market.id === 'Ada') return ADA_TOKEN_ID;
  return undefined;
};

const apy = async () => {
  const endpoint = 'https://v2.api.liqwid.finance/graphql';

  const query = gql`
    query {
      liqwid {
        data {
          markets(input: { perPage: 100 }) {
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
                id
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
    const underlyingToken = getUnderlyingToken(market);

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
      rewardTokens: market.asset.id
        ? [market.asset.id, LQ_TOKEN_ID]
        : [LQ_TOKEN_ID],
      underlyingTokens: underlyingToken ? [underlyingToken] : undefined,
      apyBaseBorrow:
        market.borrowAPY * 100 > 100
          ? market.borrowAPY
          : market.borrowAPY * 100,
      ...(underlyingToken && { borrowToken: underlyingToken }),
      totalSupplyUsd: market.supply * market.asset.price,
      totalBorrowUsd: market.borrow * market.asset.price,
    };
  };

  return markets.map(getPool).filter((i) => i.pool !== undefined);
};

module.exports = {
  protocolId: '2491',
  timetravel: false,
  apy: apy,
  url: 'https://v2.liqwid.finance/',
};
