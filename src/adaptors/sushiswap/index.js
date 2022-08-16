const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const dateFunc = require('date-fns');

const utils = require('../utils');

// base apy
const baseUrl = 'https://api.thegraph.com/subgraphs/name/sushiswap';
const urlEthereum = `${baseUrl}/exchange`;
const urlPolygon = `${baseUrl}/matic-exchange`;
const urlArbitrum = `${baseUrl}/arbitrum-exchange`;
const urlAvalanche = `${baseUrl}/avalanche-exchange`;

// reward apy
const baseUrlLm = 'https://api.thegraph.com/subgraphs/name';
const urlMc1 = `${baseUrlLm}/sushiswap/master-chef`;
const urlMc2 = `${baseUrlLm}/sushiswap/master-chefv2`;
const urlMcPolygon = `${baseUrlLm}/sushiswap/matic-minichef`;
const urlMcArbitrum = `${baseUrlLm}/matthewlilley/arbitrum-minichef`;

const queryMasterChef = gql`
  {
    masterChefs(block: {number: <PLACEHOLDER>}) {
      totalAllocPoint
      sushiPerBlock
    }
  }
`;

const queryMiniChef = gql`
  {
    miniChefs(block: {number: <PLACEHOLDER>}) {
      totalAllocPoint
      sushiPerSecond
    }
  }
`;

const querySushiAllocation = gql`
  {
    pools(first: 1000, orderBy: allocPoint, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      pair
      allocPoint
    }
  }
`;

const queryExtraAllocation = gql`
  {
    pools(
      first: 1000
      skip: 0
      orderBy: id
      orderDirection: desc
      where: { allocPoint_gt: 0 }
      block: {number: <PLACEHOLDER>}
    ) {
      id
      pair
      allocPoint
      masterChef {
        id
        totalAllocPoint
      }
      rewarder {
        id
        rewardToken
        rewardPerSecond
      }
    }
  }
`;

const queryExtraAllocationEVM = gql`
  {
    pools(first: 1000, skip: 0, orderBy: id, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      pair
      rewarder {
        id
        rewardToken
        rewardPerSecond
      }
      allocPoint
      miniChef {
        id
        sushiPerSecond
        totalAllocPoint
      }
    }
  }
`;

const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      reserve0
      reserve1
      volumeUSD
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
    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

const blockFieldsQuery = gql`
  fragment blockFields on Block {
    id
    number
    timestamp
  }
`;

const blocksQuery = gql`
  query blocksQuery(
    $first: Int! = 1000
    $skip: Int! = 0
    $start: Int!
    $end: Int!
  ) {
    blocks(
      first: $first
      skip: $skip
      orderBy: number
      orderDirection: desc
      where: { timestamp_gt: $start, timestamp_lt: $end }
    ) {
      ...blockFields
    }
  }
  ${blockFieldsQuery}
`;

// Grabs the last 1000 blocks and averages
// the time difference between them
const getAverageBlockTime = async () => {
  const now = dateFunc.startOfHour(Date.now());
  const start = dateFunc.getUnixTime(dateFunc.subHours(now, 6));
  const end = dateFunc.getUnixTime(now);
  let blocks = await request(
    'https://api.thegraph.com/subgraphs/name/blocklytics/ethereum-blocks',
    blocksQuery,
    { start, end }
  );
  blocks = blocks.blocks;

  const averageBlockTime = blocks?.reduce(
    (previousValue, currentValue, currentIndex) => {
      if (previousValue.timestamp) {
        const difference = previousValue.timestamp - currentValue.timestamp;

        previousValue.averageBlockTime =
          previousValue.averageBlockTime + difference;
      }

      previousValue.timestamp = currentValue.timestamp;

      if (currentIndex === blocks.length - 1) {
        return previousValue.averageBlockTime / blocks.length;
      }

      return previousValue;
    },
    { timestamp: null, averageBlockTime: 0 }
  );
  return averageBlockTime;
};

const buildRewardFields = (
  el,
  totalAllocPoint,
  sushiUsd,
  sushiPerBlock = null,
  sushiPerSecond = null,
  blocksPerDay = null
) => {
  el = { ...el };
  const decimals = 1e18;
  const relPoolShare = Number(el.allocPoint) / Number(totalAllocPoint);

  if (sushiPerBlock !== null) {
    rewardPerBlock = (relPoolShare * Number(sushiPerBlock)) / decimals;
    rewardPerDay = rewardPerBlock * blocksPerDay;
  } else {
    rewardPerSecond = (relPoolShare * Number(sushiPerSecond)) / decimals;
    rewardPerDay = rewardPerSecond * 86400;
  }

  el['sushiPerDay'] = rewardPerDay;
  el['sushiPerYear'] = rewardPerDay * 365;
  el['sushiPerYearUsd'] = rewardPerDay * 365 * sushiUsd;

  return el;
};

const prepareLMData = async (
  chainString,
  urlMc1,
  urlMc2,
  querySushiAllocation,
  queryExtraAllocation,
  queryChef,
  block
) => {
  const secondsPerDay = 60 * 60 * 24;
  const secondsPerBlock = await getAverageBlockTime();
  const blocksPerDay = secondsPerDay / secondsPerBlock;

  const key = 'ethereum:0x6b3595068778dd592e39a122f4f5a5cf09c90fe2';
  const sushiUsd = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [key],
    })
  ).body.coins[key].price;

  // pull sushi allocation data (sushi rewards)
  let sushiAllocation = await request(
    urlMc1,
    querySushiAllocation.replace('<PLACEHOLDER>', block)
  );
  // pull extra allocation data (extra token rewards)
  let extraAllocation = await request(
    urlMc2,
    queryExtraAllocation.replace('<PLACEHOLDER>', block)
  );
  // pull total allocation points (so we can calc the pct share of a pool)
  const sushiMc1 = await request(
    urlMc1,
    queryChef.replace('<PLACEHOLDER>', block)
  );

  // //////////////////////////////////////// ETH
  if (queryChef.includes('master')) {
    details = sushiMc1.masterChefs[0];
    // 1. calc sushi rewards
    sushiAllocation = sushiAllocation.pools.map((el) =>
      buildRewardFields(
        el,
        details.totalAllocPoint,
        sushiUsd,
        details.sushiPerBlock,
        null,
        blocksPerDay
      )
    );
    // 2. calc extra token rewards
    extraAllocation = extraAllocation.pools.map((el) =>
      buildRewardFields(
        el,
        details.totalAllocPoint,
        sushiUsd,
        details.sushiPerBlock,
        null,
        blocksPerDay
      )
    );
  } else {
    // //////////////////////////////////////// OTHER EVM CHAINS
    // arbitrum, polygon etc have different fields
    details = sushiMc1.miniChefs[0];
    // 1. calc sushi rewards
    sushiAllocation = sushiAllocation.pools.map((el) =>
      buildRewardFields(
        el,
        details.totalAllocPoint,
        sushiUsd,
        null,
        details.sushiPerSecond,
        null
      )
    );
    extraAllocation = extraAllocation.pools.map((el) =>
      buildRewardFields(
        el,
        details.totalAllocPoint,
        sushiUsd,
        null,
        details.sushiPerSecond,
        null
      )
    );
  }

  // for the extra allocation pools, we'll need to pull price data
  // and calculate the rewardPerYearUsd
  let tokenList = extraAllocation.map((el) => el.rewarder.rewardToken);
  tokenList = [...new Set(tokenList)];
  const coins = tokenList.map((t) => `${chainString}:${t}`);

  let prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins,
    })
  ).body;

  const matic = '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270';
  const keyMatic = `polygon:${matic}`;
  const maticPrice = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [keyMatic],
    })
  ).body.coins[keyMatic].price;

  prices = { ...prices.coins, ...maticPrice.coins };

  extraAllocation = extraAllocation.map((el) => {
    let decimals = 18;
    if (
      el.rewarder.rewardToken === '0x4c19596f5aaff459fa38b0f7ed92f11ae6543784'
    ) {
      decimals = 8;
    }
    let timeUnit = secondsPerDay;
    if (el.rewarder.rewardToken !== matic) {
      timeUnit = blocksPerDay;
    }
    el['rewardPerYear'] =
      (Number(el.rewarder.rewardPerSecond) / 10 ** decimals) * timeUnit * 365;
    el['rewardPerYearUsd'] =
      el.rewardPerYear * prices[`${chainString}:${el.rewardToken}`]?.price;

    return el;
  });

  // concat and return
  const data = [...sushiAllocation, ...extraAllocation];

  return data;
};

const addRewardApy = (el, dataLm) => {
  el = { ...el };
  el['sushiPerYearUsd'] = dataLm.find((x) => x.pair === el.id)?.sushiPerYearUsd;

  el['rewardPerYearUsd'] = dataLm.find(
    (x) => x.pair === el.id
  )?.rewardPerYearUsd;

  el['apySushi'] = (el.sushiPerYearUsd / Number(el.totalValueLockedUSD)) * 100;

  el['apyReward'] =
    (el.rewardPerYearUsd / Number(el.totalValueLockedUSD)) * 100;

  return el;
};

const buildPool = (entry, chainString) => {
  const apyFee = Number(entry.apy);
  const apySushi = isNaN(entry.apySushi) ? 0 : entry.apySushi;
  const apyReward = isNaN(entry.apyReward) ? 0 : entry.apyReward;
  const apy = apyFee + apySushi + apyReward;
  const symbol = utils.formatSymbol(
    `${entry.token0.symbol}-${entry.token1.symbol}`
  );

  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'sushiswap',
    symbol,
    tvlUsd: entry.totalValueLockedUSD,
    apy: apy === null ? 0 : apy,
  };

  return newObj;
};

const topLvl = async (
  chainString,
  url,
  urlMc1,
  urlMc2,
  querySushiAllocation,
  queryExtraAllocation,
  queryChef,
  timestamp
) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
    urlMc1,
    urlMc2,
  ]);

  // pull data
  let dataNow = await request(url, query.replace('<PLACEHOLDER>', block));

  let queryPriorC = queryPrior;
  queryPriorC = queryPriorC.replace('<PLACEHOLDER>', blockPrior);
  let dataPrior = await request(url, queryPriorC);

  // calculate tvl
  dataNow = await utils.tvl(dataNow.pairs, chainString);

  // calculate base apy
  let data = dataNow.map((el) => utils.apy(el, dataPrior.pairs, 'v2'));

  // get LM reward (no avalanche minichef, exlcuding from lm rewards)
  if (chainString !== 'avalanche') {
    dataLm = await prepareLMData(
      chainString,
      urlMc1,
      urlMc2,
      querySushiAllocation,
      queryExtraAllocation,
      queryChef,
      block
    );
  } else {
    dataLm = [];
  }

  // we add the reward apy
  data = data.map((el) => addRewardApy(el, dataLm));

  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async (timestamp = null) => {
  // 3 "types" of pools re apy:
  // feebased only,
  // feebased + sushi incentives,
  // feebased + sushi incentives + extra allocation
  // the final output contains the sum of these individual values

  let data = await Promise.all([
    topLvl(
      'ethereum',
      urlEthereum,
      urlMc1,
      urlMc2,
      querySushiAllocation,
      queryExtraAllocation,
      queryMasterChef,
      timestamp
    ),
    topLvl(
      'polygon',
      urlPolygon,
      urlMcPolygon,
      urlMcPolygon,
      querySushiAllocation,
      queryExtraAllocationEVM,
      queryMiniChef,
      timestamp
    ),
    topLvl(
      'arbitrum',
      urlArbitrum,
      urlMcArbitrum,
      urlMcArbitrum,
      querySushiAllocation,
      queryExtraAllocationEVM,
      queryMiniChef,
      timestamp
    ),
    topLvl('avalanche', urlAvalanche, null, null, null, null, null, timestamp),
  ]);

  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: true,
  apy: main,
};
