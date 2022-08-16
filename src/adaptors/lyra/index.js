const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url = 'https://api.thegraph.com/subgraphs/name/lyra-finance/mainnet';

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

const buildPool = (entry, chainString) => {
  const symbol = utils.formatSymbol(`sUSD(${entry.name}-Vault)`);
  const newObj = {
    pool: entry.liquidityPool.id,
    chain: utils.formatChain(chainString),
    project: 'lyra',
    symbol,
    apyBase: entry.apy,
    tvlUsd: entry.NAV,
    underlyingTokens: [entry.quoteAddress],
  };

  return newObj;
};

const getAPY = (dataNow, dataPrior) => {
  dataNow['NAV'] = dataNow.marketTotalValueHistory[0].NAV / 1e18;
  dataNow['tokenPriceNow'] =
    dataNow.marketTotalValueHistory[0].tokenPrice / 1e18;
  dataNow['tokenPricePrior'] = 1;
  dataNow['tokenPricePrior'] =
    dataPrior.find((el) => el.id === dataNow.id)?.marketTotalValueHistory[0]
      .tokenPrice / 1e18;
  dataNow['apy'] =
    ((dataNow['tokenPriceNow'] - dataNow['tokenPricePrior']) /
      dataNow['tokenPricePrior']) *
    MONTHS_IN_YEAR *
    100;
  return dataNow;
};

const topLvl = async (chainString, timestamp, url) => {
  dataNow = await request(
    url,
    (timestamp == null ? queryNow : query).replace('<PLACEHOLDER>', timestamp)
  );
  let priorTimestamp =
    timestamp == null
      ? Math.floor(Date.now() / 1000) - SECONDS_IN_MONTH
      : timestamp - SECONDS_IN_MONTH;

  // pull 24h offset data to calculate fees from swap volume
  let dataPrior = await request(
    url,
    query.replace('<PLACEHOLDER>', priorTimestamp)
  );

  // calculate apy
  let data = dataNow.markets.map((el) => getAPY(el, dataPrior.markets, 'v2'));

  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async (timestamp = null) => {
  const data = await Promise.all([topLvl('optimism', timestamp, url)]);
  return data.flat();
};

module.exports = {
  timetravel: true,
  apy: main,
};
