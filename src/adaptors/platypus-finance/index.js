const { gql, default: request } = require('graphql-request');
const { mapKeys } = require('lodash');
const superagent = require('superagent');
const { get } = require('lodash');
const utils = require('../utils');

const POOLS_URL =
  'https://api.thegraph.com/subgraphs/name/platypus-finance/platypus-dashboard-staging';

const APY_URL =
  'https://api.thegraph.com/subgraphs/name/johnlinus2021/platypus-apr-staging';

const APY_API =
  'https://8rehqf7xvk.execute-api.us-west-1.amazonaws.com/default/median_APR_MP4_v2';

const getPrices = async (addresses) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses,
    })
  ).body.coins;

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return pricesByAddress;
};

const apyQuery = gql`
  query Apy {
    assets {
      bonusTokenAPR
      pid
      id
      poolAddress
      ptpBaseAPR
      totalBaseAPR
      bonusToken {
        id
        lastUpdate
      }
      underlyingToken {
        id
        symbol
      }
    }
  }
`;

const poolsQuery = gql`
  query Pools {
    pools {
      id
      name
      assetsList {
        liabilityUSD
        cashUSD
        cash
        token {
          symbol
          id
        }
        pid
      }
      cashUSD
    }
  }
`;

const apy = async () => {
  const { pools } = await request(POOLS_URL, poolsQuery);
  const { assets: apy } = await request(APY_URL, apyQuery);
  const apyMap = mapKeys(await utils.getData(APY_API), (_, key) =>
    key.toLowerCase()
  );
  console.log(apyMap);

  const prices = await getPrices(
    apy.map(({ underlyingToken }) => `avax:${underlyingToken.id}`)
  );

  const res = pools.map((pool) => {
    const underlyingPools = pool.assetsList.map((token) => {
      const { symbol, id } = token.token;
      const apyVal = apy.find(
        ({ poolAddress, underlyingToken }) =>
          poolAddress === pool.id && underlyingToken.id === id
      );
      const price = symbol.toLowerCase().includes('usd')
        ? 1
        : prices[get(apyVal, 'underlyingToken.id', '').toLowerCase()] || 0;

      const apyFromApi = apyMap[apyVal?.id];
      const apyReward = apyFromApi
        ? Object.values(apyFromApi).reduce((acc, o) => acc + o, 0)
        : 0;

      const tvlUsd = price * Number(token.cash);
      return {
        pool: `${pool.id}-${id}`,
        chain: utils.formatChain('avalanche'),
        project: 'platypus-finance',
        symbol: symbol,
        poolMeta: pool.name || null,
        tvlUsd,
        apyReward: Number((apyVal && apyVal.totalBaseAPR) || 0) || apyReward,
        rewardTokens: [
          '0x22d4002028f537599be9f666d1c4fa138522f9c8', // PTP
          get(apyVal, 'bonusToken.id', null),
        ].filter(Boolean),
        underlyingTokens: [id],
      };
    });

    return underlyingPools;
  });

  return res.flat();
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.platypus.finance/pool',
};
