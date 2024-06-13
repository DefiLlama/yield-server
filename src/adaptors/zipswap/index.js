const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

const subgraphURL = sdk.graph.modifyEndpoint('5tAUjmnM9iE4aADZwKhk3fobY8fMFbb1VMsrSKvo4kFr');

const getCurrentDate = gql`
  {
    uniswapDayDatas(orderBy: date, orderDirection: desc, first: 1) {
      date
    }
  }
`;
const getDate = async () => {
  let data = await request(subgraphURL, getCurrentDate);
  let date = data.uniswapDayDatas[0].date;
  return date + '';
};

var query = gql`
{
  pairDayDatas(first: 10,
    orderDirection: desc,
    orderBy: dailyVolumeUSD,where:{
    date: <placeholder>,
  })
    {
    id
    pairAddress
    reserveUSD
    dailyVolumeUSD
    token0 {
      symbol
    }
    token1 {
      symbol
    }
  }
}
`;

const acquireData = async () => {
  let obj = [];
  let date = await getDate();
  query = query.replace('<placeholder>', date);
  let results = await request(subgraphURL, query);
  results.pairDayDatas.forEach((pairs) => {
    newObj = {
      pool: pairs.pairAddress,
      chain: utils.formatChain('optimism'),
      project: 'zipswap',
      symbol: `${pairs.token0['symbol']}-${pairs.token1['symbol']}`,
      tvlUsd: parseFloat(pairs.reserveUSD),
      apyBase:
        parseFloat(pairs.dailyVolumeUSD / pairs.reserveUSD) * 365 * 0.003 * 100,
    };
    obj.push(newObj);
  });
  return obj;
};

module.exports = {
  timetravel: false,
  apy: acquireData,
  url: 'https://zipswap.fi/#/farm',
};
