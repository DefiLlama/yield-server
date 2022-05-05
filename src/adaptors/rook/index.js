const { request, gql } = require('graphql-request');

const utils = require('../utils');
const pools = require('./pools.json');

const url =
  'https://api.thegraph.com/subgraphs/name/keeperdao/keeperdao-staging';

const query1 = gql`
  {
    liquidityPoolSupplies {
      id
      supply
    }
  }
`;

const query2 = gql`
  {
    underlyingTokens {
      id
      kToken {
        id
      }
    }
  }
`;

const tvl = (entry, priceData, pools) => {
  entry = { ...entry };
  const pool = pools.find((el) => el.address === entry.id);
  entry.name = pool.idFrontEnd;
  entry.scaledSupplyUsd =
    (Number(entry.supply) / 10 ** pool.decimals) * priceData[pool.id].usd;

  return entry;
};

const getRookPerYear = (data, priceData) => {
  // roughly 90 days for each act
  // const baseRookReward = 200000;
  // const decayParam = 0.7;
  // const n = 3; // this will increment with every new act
  // const rookRewardsAct = baseRookReward * decayParam ** n; // will be 98000 for act 3
  const rookRewardsAct = 36500;
  const nbActsPerYear = 4; // basically the quarters
  const lpShareOfRewards = 0.2; // LPs get 20% of the rewards per act (this can change via governance)

  const rookYearlyRewards =
    (rookRewardsAct * nbActsPerYear * lpShareOfRewards) / data.length;
  const rookYearlyRewardsUsd = rookYearlyRewards * priceData.rook.usd;

  return rookYearlyRewardsUsd;
};

const buildPool = (entry, rookYearlyRewardsUsd, chainString) => {
  const newObj = {
    pool: entry.kToken.id,
    chain: utils.formatChain(chainString),
    project: 'rook',
    symbol: utils.formatSymbol(entry.name),
    tvlUsd: entry.scaledSupplyUsd,
    apy: (rookYearlyRewardsUsd / entry.scaledSupplyUsd) * 100,
  };

  return newObj;
};

const topLvl = async (chainString, url) => {
  // get price data
  const tokens = 'renbtc,dai,usd-coin,ethereum,weth,rook';
  const priceData = await utils.getCGpriceData(tokens, true);

  // pull data
  let supplyData = await request(url, query1);
  let data = await request(url, query2);
  data = data.underlyingTokens;

  // add supply to data object
  for (const el of data) {
    el['supply'] = supplyData.liquidityPoolSupplies.find(
      (i) => i.id === el.id
    ).supply;
  }

  // calculate tvl
  data = data.map((el) => tvl(el, priceData, pools));

  // get rook reward
  const rookYearlyRewardsUsd = getRookPerYear(data, priceData);

  // build pool objects
  data = data.map((el) => buildPool(el, rookYearlyRewardsUsd, chainString));

  return data;
};

const main = async () => {
  const data = await Promise.all([topLvl('ethereum', url)]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
