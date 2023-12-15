const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url =
  'https://subgraph.satsuma-prod.com/sw9vuxiQey3c/lyra/optimism-mainnet-newport/api';

const SECONDS_IN_MONTH = 2592000;
const MONTHS_IN_YEAR = 12;

const query = gql`
  {
    markets{
        id
        quoteAddress
            liquidityPool{
                id
            }
          name
            marketTotalValueHistory(first: 1 where:{timestamp_gte: <PLACEHOLDER>} orderBy:timestamp orderDirection: asc){
                timestamp
                tokenPrice
                NAV
            }
        }
  }
`;

const queryNow = gql`
  {
    markets {
      id
      quoteAddress
      liquidityPool {
        id
      }
      name
      marketTotalValueHistory(
        first: 1
        orderBy: timestamp
        orderDirection: desc
      ) {
        timestamp
        tokenPrice
        NAV
      }
    }
  }
`;

const apy = async (timestamp = null) => {
  const data = (
    await request(
      url,
      (timestamp == null ? queryNow : query).replace('<PLACEHOLDER>', timestamp)
    )
  ).markets;

  // note: lyra used 30day window for calculating this...given their options have a 7d window
  // it would make more sense to switch to 7day apy values instead...
  const priorTimestamp30d =
    timestamp == null
      ? Math.floor(Date.now() / 1000) - SECONDS_IN_MONTH
      : timestamp - SECONDS_IN_MONTH;

  const dataPrior30d = (
    await request(url, query.replace('<PLACEHOLDER>', priorTimestamp30d))
  ).markets;

  const priorTimestamp7d = Math.floor(Date.now() / 1000) - 604800;
  const dataPrior7d = (
    await request(url, query.replace('<PLACEHOLDER>', priorTimestamp7d))
  ).markets;

  return data
    .map((p) => {
      const marketTotalValueHistory30d = dataPrior30d.find(
        (el) => el.id === p.id
      )?.marketTotalValueHistory;

      const marketTotalValueHistory7d = dataPrior7d.find(
        (el) => el.id === p.id
      )?.marketTotalValueHistory;

      if (
        !marketTotalValueHistory30d?.length ||
        !marketTotalValueHistory7d?.length
      )
        return null;

      const NAV = p.marketTotalValueHistory[0].NAV / 1e18;
      const tokenPriceNow = p.marketTotalValueHistory[0].tokenPrice / 1e18;

      const tokenPricePrior30d =
        marketTotalValueHistory30d[0].tokenPrice / 1e18;

      const tokenPricePrior7d = marketTotalValueHistory7d[0].tokenPrice / 1e18;

      const return30d =
        (tokenPriceNow - tokenPricePrior30d) / tokenPricePrior30d;

      const return7d = (tokenPriceNow - tokenPricePrior7d) / tokenPricePrior7d;

      return {
        pool: p.liquidityPool.id,
        chain: utils.formatChain('optimism'),
        project: 'lyra-v1',
        symbol: 'sUSD',
        poolMeta: `${p.name}-Vault`,
        apyBase: return30d * MONTHS_IN_YEAR * 100,
        tvlUsd: NAV,
        underlyingTokens: [p.quoteAddress],
        il7d: return7d > 0 ? null : return7d * 100,
      };
    })
    .filter((p) => p !== null);
};

module.exports = {
  timetravel: true,
  apy,
  url: 'https://app.lyra.finance/vaults',
};
