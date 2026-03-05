const { request, gql } = require('graphql-request');

// Cardano symbol → coingecko ID mapping for underlying/reward tokens
const CARDANO_COINGECKO = {
  Ada: 'coingecko:cardano',
  USDC: 'coingecko:usd-coin',
  NIGHT: 'coingecko:midnight-3',
  DJED: 'coingecko:djed',
  USDA: 'coingecko:anzens-usda',
  USDM: 'coingecko:usdm-2',
  IUSD: 'coingecko:iusd',
  SNEK: 'coingecko:snek',
  USDT: 'coingecko:tether',
  MIN: 'coingecko:minswap',
  IAG: 'coingecko:iagon',
  SHEN: 'coingecko:shen',
  ERG: 'coingecko:ergo',
  BTC: 'coingecko:bitcoin',
  COPI: 'coingecko:cornucopias',
  DAI: 'coingecko:dai',
  ETH: 'coingecko:ethereum',
  PYUSD: 'coingecko:paypal-usd',
  EURC: 'coingecko:euro-coin',
};

const LQ_TOKEN_ID =
  'da8c30857834c6ae7203935b89278c532b3995245295456f993e1d244c51';

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
    const tokenId = CARDANO_COINGECKO[market.id];

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
      underlyingTokens: tokenId ? [tokenId] : undefined,
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
