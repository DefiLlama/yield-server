const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url = 'https://api.thegraph.com/subgraphs/name/traderjoe-xyz/exchange';
const urlLM =
  'https://api.thegraph.com/subgraphs/name/traderjoe-xyz/masterchefv2';

const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveAVAX, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
      reserve0
      reserve1
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveAVAX orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

const queryMasterChef = gql`
  {
    masterChefs(block: {number: <PLACEHOLDER>}) {
      totalAllocPoint
      joePerSec
    }
  }
`;

const queryJoeAllocation = gql`
  {
    pools(first: 1000, orderBy: allocPoint, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      pair
      allocPoint
    }
  }
`;

const prepareLMData = async (urlLM, block) => {
  const joeUsd = await utils.getCGpriceData('joe', true);

  // get pair allocation points
  let joeAllocation = await request(
    urlLM,
    queryJoeAllocation.replace('<PLACEHOLDER>', block)
  );

  // get total Allocation points
  let joeMc = await request(
    urlLM,
    queryMasterChef.replace('<PLACEHOLDER>', block)
  );
  const details = joeMc.masterChefs[0];

  for (const el of joeAllocation.pools) {
    const relPoolShare =
      Number(el.allocPoint) / Number(details.totalAllocPoint);

    // LPs receive 50% of rewards, so we divide by 2
    const rewardPerSecond =
      (relPoolShare * Number(details.joePerSec)) / 1e18 / 2;
    const rewardPerDay = rewardPerSecond * 86400;

    el['joePerDay'] = rewardPerDay;
    el['joePerYear'] = rewardPerDay * 365;
    el['joePerYearUsd'] = rewardPerDay * 365 * joeUsd.joe.usd;
  }

  return joeAllocation;
};

const buildPool = (entry, chainString) => {
  const apyFee = Number(entry.apy);
  const apyJoe = isNaN(entry.apyJoe) ? 0 : entry.apyJoe;
  const symbol = utils.formatSymbol(
    `${entry.token0.symbol}-${entry.token1.symbol}`
  );
  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'trader-joe',
    symbol,
    tvlUsd: entry.totalValueLockedUSD,
    apy: apyFee + apyJoe,
  };

  return newObj;
};

const topLvl = async (chainString, timestamp, url, urlLM) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
    urlLM,
  ]);

  // pull data
  let dataNow = await request(url, query.replace('<PLACEHOLDER>', block));

  // pull 24h offset data to calculate fees from swap volume
  const dataPrior = await request(
    url,
    queryPrior.replace('<PLACEHOLDER>', blockPrior)
  );

  // calculate tvl
  dataNow = await utils.tvl(dataNow.pairs, 'avax');

  // calculate apy
  let data = dataNow.map((el) => utils.apy(el, dataPrior.pairs, 'v2'));

  // get LM rewards and add to object
  const dataLm = await prepareLMData(urlLM, block);
  for (const el of data) {
    el['joePerYearUsd'] = dataLm.pools.find(
      (x) => x.pair === el.id
    )?.joePerYearUsd;
    el['apyJoe'] = (el.joePerYearUsd / Number(el.totalValueLockedUSD)) * 100;
  }

  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async (timestamp = null) => {
  const data = await Promise.all([topLvl('avalanche', timestamp, url, urlLM)]);
  return data.flat();
};

module.exports = {
  timetravel: true,
  apy: main,
};
