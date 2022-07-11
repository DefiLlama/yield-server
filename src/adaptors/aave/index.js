const { request, gql } = require('graphql-request');

const utils = require('../utils');

const baseUrl = 'https://api.thegraph.com/subgraphs/name/aave'; 
const urlV2 = `${baseUrl}/protocol-v2`; 
const urlPolygon = `${baseUrl}/aave-v2-matic`;
const urlAvalanche = 'https://aave-api-v2.aave.com/data/markets-data';

const query = gql`
  {
    reserves {
      id
      name
      symbol
      decimals
      liquidityRate
      aEmissionPerSecond
      totalATokenSupply
      price {
        priceInEth
      }
    }
  }
`;

const tvl = (entry, ethPriceUSD) => {
  entry = { ...entry };
  const totalATokenSupply = Number(entry.totalATokenSupply);
  const totalATokenSupplyNormalised = totalATokenSupply / 10 ** entry.decimals;

  entry.totalLiquidityUSD =
    totalATokenSupplyNormalised *
    (Number(entry.price.priceInEth) / 1e18) *
    ethPriceUSD;

  return entry;
};

const apy = (entry, rewardTokenPriceInEth) => {
  entry = { ...entry };

  entry.incentive_apy = 0;
  // NOTE(these rewards are no longer active. i assumed the aEmmisionPerSecond would be updated
  // accordingly...need to switch to their latest contracts which for which we can call `emissionEndTimestamp`)
  // if (entry.aEmissionPerSecond !== '0') {
  //   const SECONDS_PER_YEAR = 3.154e7;
  //   const REWARD_TOKEN_DECIMALS = 18;

  //   const tokenDecimals = entry.decimals;
  //   const aEmissionPerSecond = Number(entry.aEmissionPerSecond);
  //   const tokenPriceInEth = Number(entry.price.priceInEth);

  //   const num =
  //     aEmissionPerSecond *
  //     SECONDS_PER_YEAR *
  //     rewardTokenPriceInEth *
  //     10 ** tokenDecimals;
  //   const denom =
  //     entry.totalATokenSupply * tokenPriceInEth * 10 ** REWARD_TOKEN_DECIMALS;

  //   entry.incentive_apy = 100 * (num / denom);
  // }
  return entry;
};

const buildPool = (entry, chainString) => {
  let apy;
  if (chainString === 'avalanche') {
    apy = (Number(entry.liquidityRate) + Number(entry.aIncentivesAPY)) * 100;
  } else {
    apy = Number(entry.liquidityRate) / 1e25 + entry.incentive_apy;
  }

  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'aave',
    symbol: utils.formatSymbol(entry.symbol),
    tvlUsd: Number(entry.totalLiquidityUSD),
    apy,
  };

  return newObj;
};

const topLvl = async (chainString, url, rewardTokenString = null) => {
  let data = [];
  if (chainString === 'avalanche') {
    data = await utils.getData(url);

    // filter to specific id only
    data = data.reserves.filter((el) => el.id.endsWith('ce3ede02a318f'));
  } else {
    // get asset price in usd
    let price = await utils.getCGpriceData('ethereum', true);

    // pull data
    data = await request(url, query);

    // calculate tvl in usd
    data = data.reserves.map((el) => tvl(el, price['ethereum'].usd));

    // calculate apy
    // get rewardToken price in eth (for incentivsed rewards)
    const priceInEthRewardToken = Number(
      data.find((el) => el.symbol === rewardTokenString.toUpperCase()).price
        .priceInEth
    );
    data = data.map((el) => apy(el, priceInEthRewardToken));
  }
  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async () => {
  const data = await Promise.all([
    topLvl('ethereum', urlV2, 'aave'),
    topLvl('polygon', urlPolygon, 'wmatic'),
    topLvl('avalanche', urlAvalanche),
  ]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
