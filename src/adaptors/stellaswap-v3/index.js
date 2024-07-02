const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const utils = require('../utils');

const urlMoonbeam = 'https://api.studio.thegraph.com/proxy/78672/pulsar/v0.0.1/';
const urlBlocksSubgraph = 'https://api.studio.thegraph.com/proxy/78672/pulsar-blocks/v0.0.1/';
const urlConliqSubgraph = 'https://api.studio.thegraph.com/proxy/78672/pulsar/v0.0.1/';
const urlFarmingSubgraph = 'https://api.studio.thegraph.com/proxy/78672/pulsar-farming/v0.0.1/';

const queryPools = gql`
  {
    pools(first: 50, orderBy: totalValueLockedUSD, orderDirection: desc) {
      id  
      volumeUSD
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      totalValueLockedToken0
      totalValueLockedToken1
      totalValueLockedUSD
      feesUSD
      feesToken0
      feesToken1
      token0Price
      token1Price
      tick
      liquidity
    }
  }
  `;

const queryPrior = gql`
  {
    pools(first: 50, orderBy: totalValueLockedUSD, orderDirection: desc) {
      id
      volumeUSD
      feesToken0
      feesToken1
      token0Price
      token1Price
    }
  }
`;

const tickToSqrtPrice = (tick) => {
  return new BigNumber(Math.sqrt(1.0001 ** tick));
};

const getAmounts = (liquidity, tickLower, tickUpper, currentTick) => {
  liquidity = new BigNumber(liquidity); // Ensure liquidity is a BigNumber
  const currentPrice = tickToSqrtPrice(currentTick);
  const lowerPrice = tickToSqrtPrice(tickLower);
  const upperPrice = tickToSqrtPrice(tickUpper);
  let amount1, amount0;
  if (currentPrice.isLessThan(lowerPrice)) {
    amount1 = new BigNumber(0);
    amount0 = liquidity.times(new BigNumber(1).div(lowerPrice).minus(new BigNumber(1).div(upperPrice)));
  } else if (currentPrice.isGreaterThanOrEqualTo(lowerPrice) && currentPrice.isLessThanOrEqualTo(upperPrice)) {
    amount1 = liquidity.times(currentPrice.minus(lowerPrice));
    amount0 = liquidity.times(new BigNumber(1).div(currentPrice).minus(new BigNumber(1).div(upperPrice)));
  } else {
    amount1 = liquidity.times(upperPrice.minus(lowerPrice));
    amount0 = new BigNumber(0);
  }
  return { amount0, amount1 };
};


const fetchWithRetry = async (url, query, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await request(url, query);
    } catch (error) {
      console.error(`Attempt ${attempt} failed: ${error.message}`);
      if (attempt === retries) {
        throw error;
      }
      // await new Promise(res => setTimeout(res, 1000 * attempt)); // Exponential backoff
    }
  }
};

const getPreviousBlockNumber = async (aprDelta, blockDelta, startBlock) => {
  const previousDate = Math.floor(Date.now() / 1000) - aprDelta;
  const queryString = gql`
  {
    blocks(
      first: 1
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lt: ${previousDate}, timestamp_gt: ${previousDate - blockDelta} }
    ) {
      number
    }
  }`;
  const response = await fetchWithRetry(urlBlocksSubgraph, queryString);
  const blockNumber = response.blocks[0]?.number === undefined ? startBlock : response.blocks[0]?.number;
  return blockNumber;
};

const getPositionsOfPool = async (poolId) => {
  const result = [];
  let i = 0;
  while (true) {
    const queryString = gql`
    query {
      positions(first: 50, skip: ${i * 1000}, where: { liquidity_gt: 0, pool: "${poolId}" }) {
        id
        owner
        tickLower {
          tickIdx
        }
        tickUpper {
          tickIdx
        }
        liquidity
        depositedToken0
        depositedToken1
        token0 {
          decimals
        }
        token1 {
          decimals
        }
        pool {
          id
          token0Price
        }
      }
    }`;
    const positions = await fetchWithRetry(urlConliqSubgraph, queryString);
    result.push(...positions.positions);
    if (positions.positions.length < 1000) {
      break;
    }
    i += 1;
  }
  return result;
};

const getEternalFarmingInfo = async () => {
  const queryString = `
  {
    eternalFarmings{
      id
      rewardToken
      bonusRewardToken
      rewardRate
      bonusRewardRate
      pool
    }
  }
  `;
  const eternalFarmings = await request(urlFarmingSubgraph, queryString);
  return eternalFarmings.eternalFarmings;
};

const getTokenInfoByAddress = async (tokenAddress) => {
  const queryString = `
  {
    tokens(where:{id:"${tokenAddress}"}){
      derivedMatic
      decimals
    }
  }
  `;
  const tokens = await request(urlConliqSubgraph, queryString);
  return tokens.tokens;
};

const getPositionsInEternalFarming = async (farmingId) => {
  const result = [];
  let i = 0;
  while (true) {
    const queryString = `{
      deposits(where:{eternalFarming:"${farmingId}"}, first:50, skip:${i * 1000}){
        id
      }
    }`;
    const positions = await request(urlFarmingSubgraph, queryString);
    result.push(...positions.deposits);
    if (positions.deposits.length < 1000) {
      break;
    }
    i += 1;
  }
  return result;
};


const getPositionsById = async (tokenIds) => {
  tokenIds = tokenIds.map((tokenId) => tokenId.id);
  const result = [];
  let i = 0;
  while (true) {
    const queryString = `{
      positions(where:{id_in:${JSON.stringify(tokenIds)}}, first:50, skip:${i * 1000}){
        id
        liquidity
        tickLower{
          tickIdx
        }
        tickUpper{
          tickIdx
        }
        pool{
          token0{
            name
            decimals
            derivedMatic
          }
          token1{
            name
            decimals
            derivedMatic
          }
          tick
        }
      }
    }`;
    const positions = await request(urlConliqSubgraph, queryString);
    result.push(...positions.positions);
    if (positions.positions.length < 1000) {
      break;
    }
    i += 1;
  }
  return result;
};

const updateEternalFarmsApr = async () => {
  console.log('Updating Farms APR');
  const eternalFarmings = await getEternalFarmingInfo();
  const eternalObj = {
    farmPools: {},
    farms: {},
    updatedAt: 0,
  };
  for (const farming of eternalFarmings) {
    const tokenIds = await getPositionsInEternalFarming(farming.id);
    const token0 = (await getTokenInfoByAddress(farming.rewardToken))[0];
    const token1 = (await getTokenInfoByAddress(farming.bonusRewardToken))[0];
    let totalNativeAmount = 0.0;
    const positions = await getPositionsById(tokenIds);

    for (const position of positions) {
      const { amount0, amount1 } = getAmounts(
        new BigNumber(position.liquidity),
        new BigNumber(position.tickLower.tickIdx),
        new BigNumber(position.tickUpper.tickIdx),
        new BigNumber(position.pool.tick),
      );
      totalNativeAmount += (amount0 * new BigNumber(position.pool.token0.derivedMatic)) / new BigNumber(10).pow(position.pool.token0.decimals);
      totalNativeAmount += (amount1 * new BigNumber(position.pool.token1.derivedMatic)) / new BigNumber(10).pow(position.pool.token1.decimals);
    }

    const token0RewardRate = new BigNumber(farming.rewardRate);
    const token0Matic = new BigNumber(token0.derivedMatic);
    const token0Decimals = new BigNumber(10).pow(token0.decimals);
    const reward0PerSecond = token0RewardRate.times(token0Matic).dividedBy(token0Decimals);
    let totalReward = reward0PerSecond;
    let reward1PerSecond = 0;
    if (token1?.derivedMatic) {
      const token1RewardRate = new BigNumber(farming.bonusRewardRate);
      const token1Matic = new BigNumber(token1.derivedMatic);
      const token1Decimals = new BigNumber(10).pow(token1.decimals);
      reward1PerSecond = token1RewardRate.times(token1Matic).dividedBy(token1Decimals);
      totalReward = totalReward.plus(reward1PerSecond);
    }

    let apr = new BigNumber(0);
    let rewardTokenApr = new BigNumber(0);
    let bonusTokenApr = new BigNumber(0);
    if (totalNativeAmount > 0) {
      apr = totalReward.dividedBy(new BigNumber(totalNativeAmount)).times(86400 * 365 * 100);
      rewardTokenApr = reward0PerSecond.dividedBy(new BigNumber(totalNativeAmount)).times(86400 * 365 * 100);
      bonusTokenApr = reward1PerSecond !== 0 ? reward1PerSecond.dividedBy(new BigNumber(totalNativeAmount)).times(86400 * 365 * 100) : new BigNumber(0);
    }
    eternalObj.farms[farming.id] = apr.toString();
    eternalObj.farmPools[farming.pool] = {
      farmindId: farming.id,
      lastApr: apr.toString(),
      rewardTokenApr: rewardTokenApr.toString(),
      rewardToken: farming.rewardToken,
      bonusTokenApr: bonusTokenApr.toString(),
      bonusToken: farming.bonusRewardToken,
    };
  }

  eternalObj.updatedAt = (Date.now() / 1000).toFixed(0);
  return eternalObj;
};

const aprDelta = 259200;
const blockDelta = 60;
const startBlock = 2649799;


const topLvl = async (chainString, timestamp, url) => {


  const prevBlockNumber = await getPreviousBlockNumber(aprDelta, blockDelta, startBlock);

  const queryPoolsPrior = gql`
  {
    pools(block: { number: ${prevBlockNumber} }, first: 50, orderBy: id) {
      feesToken0
      feesToken1
      id
      token0 {
        name
        decimals
      }
      token1 {
        name
        decimals
      }
      token0Price
      tick
      liquidity
    }
  }`;
  const responsePrior = await fetchWithRetry(urlConliqSubgraph, queryPoolsPrior);
  const dataPrior = responsePrior.pools;

  let data = (await fetchWithRetry(url, queryPools)).pools;

  const balanceCalls = [];
  for (const pool of data) {
    balanceCalls.push({
      target: pool.token0.id,
      params: pool.id,
    });
    balanceCalls.push({
      target: pool.token1.id,
      params: pool.id,
    });
  }

  const tokenBalances = await sdk.api.abi.multiCall({
    abi: 'erc20:balanceOf',
    calls: balanceCalls,
    chain: chainString,
    permitFailure: true,
  });

  data = data.map((p) => {
    const x = tokenBalances.output.filter((i) => i.input.params[0] === p.id);
    return {
      ...p,
      reserve0: new BigNumber(x.find((i) => i.input.target === p.token0.id)?.output || 0).div(new BigNumber(10).pow(p.token0.decimals)),
      reserve1: new BigNumber(x.find((i) => i.input.target === p.token1.id)?.output || 0).div(new BigNumber(10).pow(p.token1.decimals)),
    };
  });

  data = await utils.tvl(data, chainString);

  const poolsFees = {};
  const poolsCurrentTvl = {};
  const ratioMultiplier = new BigNumber(1e18); // ratio is in 0.0000s, this is to get at least 18 decimals figure

  for (const pool of data) {
    const currentFeesInToken0 = new BigNumber(pool.feesToken0).plus(new BigNumber(pool.feesToken1).times(new BigNumber(pool.token0Price)));
    const priorData = dataPrior.find(dp => dp.id === pool.id);
    const priorFeesInToken0 = priorData ? new BigNumber(priorData.feesToken0).plus(new BigNumber(priorData.feesToken1).times(new BigNumber(priorData.token0Price))) : new BigNumber(0);
    const feesIn24Hours = currentFeesInToken0.minus(priorFeesInToken0);

    poolsFees[pool.id] = feesIn24Hours;
    poolsCurrentTvl[pool.id] = new BigNumber(0);

    const positionsJson = await getPositionsOfPool(pool.id);
    for (const position of positionsJson) {
      const currentTick = new BigNumber(pool.tick);
      const { amount0, amount1 } = getAmounts(
        new BigNumber(position.liquidity),
        new BigNumber(position.tickLower.tickIdx),
        new BigNumber(position.tickUpper.tickIdx),
        currentTick,
      );
      const adjustedAmount0 = amount0.div(new BigNumber(10).pow(position.token0.decimals));
      const adjustedAmount1 = amount1.div(new BigNumber(10).pow(position.token1.decimals));
      poolsCurrentTvl[pool.id] = poolsCurrentTvl[pool.id].plus(adjustedAmount0).plus(adjustedAmount1.times(new BigNumber(pool.token0Price)));
    }
  }

  let poolsAPRObj = {};

  const getCurrentPoolsInfo = async () => {
    const prevBlockNumber = await getPreviousBlockNumber(aprDelta, blockDelta, startBlock);
    const queryString = `
    {
      pools(block: {number: ${prevBlockNumber}}, first: 50, orderBy: id) {
        feesToken0
        feesToken1
        id
        token0 {
          name
        }
        token1 {
          name
        }
        token0Price
        tick
        liquidity
      }
    }
    `;
    const previousPools = await fetchWithRetry(urlConliqSubgraph, queryString);
    const poolsJsonPrevious = {};
    for (const pool of previousPools.pools) {
      poolsJsonPrevious[pool.id] = { feesToken0: pool.feesToken0, feesToken1: pool.feesToken1 };
    }

    const queryStringNew = `{
      pools(first: 50, orderBy: id) {
        feesToken0
        feesToken1
        id
        token0 {
          name
          symbol
          decimals
        }
        token1 {
          name
          symbol
          decimals
        }
        token0Price
        tick
        liquidity
      }
    }`;
    const pools = await fetchWithRetry(urlConliqSubgraph, queryStringNew);

    const poolsJson = [];
    for (const pool of pools.pools) {
      poolsJson.push({ ...pool });
    }

    for (let i = 0; i < poolsJson.length; i += 1) {
      try {
        poolsJson[i].feesToken0 = (+poolsJson[i].feesToken0) - (+poolsJsonPrevious[poolsJson[i].id].feesToken0);
        poolsJson[i].feesToken1 = (+poolsJson[i].feesToken1) - (+poolsJsonPrevious[poolsJson[i].id].feesToken1);
      } catch (error) {
        poolsJson[i].feesToken0 = (+poolsJson[i].feesToken0);
        poolsJson[i].feesToken1 = (+poolsJson[i].feesToken1);
      }
    }
    return poolsJson;
  }


  const updatePoolsApr = async (data, dataPrior) => {
    console.log('Updating Pools APR');
    const poolsJson = await getCurrentPoolsInfo();
    const poolsTick = {};
    const poolsCurrentTvl = {};
    const poolsFees = {};
  
    for (const pool of poolsJson) {
      poolsTick[pool.id] = (+pool.tick);
      poolsCurrentTvl[pool.id] = 0;
      if (poolsFees[pool.id] === undefined) {
        poolsFees[pool.id] = (+pool.feesToken0);
      } else {
        poolsFees[pool.id] += (+pool.feesToken0);
      }
      poolsFees[pool.id] += pool.feesToken1 * (+pool.token0Price);
  
      const positionsJson = await getPositionsOfPool(pool.id);
      for (const position of positionsJson) {
        const currentTick = poolsTick[position.pool.id];
        if (((+position.tickLower.tickIdx) < currentTick) && (currentTick < (+position.tickUpper.tickIdx))) {
          let { amount0, amount1 } = getAmounts(
            (+position.liquidity),
            (+position.tickLower.tickIdx),
            (+position.tickUpper.tickIdx),
            currentTick,
          );
          amount0 /= (10 ** (+position.token0.decimals));
          amount1 /= (10 ** (+position.token1.decimals));
          poolsCurrentTvl[position.pool.id] += amount0;
          poolsCurrentTvl[position.pool.id] += amount1 * (+position.pool.token0Price);
        }
      }
    }
  
    const poolsAPR = {};
    for (const pool of poolsJson) {
      if (poolsCurrentTvl[pool.id] !== 0) {
        poolsAPR[pool.id] = (((poolsFees[pool.id] * 365).toFixed(2) / (poolsCurrentTvl[pool.id])) * 100);
      } else {
        poolsAPR[pool.id] = 0;
      }
    }
    poolsAPR.updatedAt = (Date.now() / 1000).toFixed(0);
    return poolsAPR;
  }


  const poolsBaseApr = await updatePoolsApr(data, dataPrior);
  const eternalAPRObj = await updateEternalFarmsApr();

  // await updatePoolsApr(data, dataPrior);


  const poolsAPR = {};
  const poolsRewardTokens = {}; // Add this to store reward tokens for each pool

  for (const pool of data) {
    const aprDataForPool = eternalAPRObj.farmPools[pool.id];
    const apr = aprDataForPool ? new BigNumber(aprDataForPool.lastApr) : new BigNumber(0);
    poolsAPR[pool.id] = apr;
  
    const rewardTokens = apr.isNaN() || apr.eq(0) ? [] : [pool.token0.id, pool.token1.id];
    poolsRewardTokens[pool.id] = rewardTokens; // Store reward tokens for each pool
  }

  data = data.map((p) => {
  const apr = poolsAPR[p.id];
  const baseAPR = poolsBaseApr[p.id] !== undefined ? poolsBaseApr[p.id] : 0; // Set to 0 if undefined
  const rewardTokens = poolsRewardTokens[p.id]; // Retrieve reward tokens for each pool

  return {
    pool: p.id,
    chain: utils.formatChain(chainString),
    project: 'stellaswap-v3',
    symbol: `${p.token0.symbol}-${p.token1.symbol}`,
    tvlUsd: parseFloat(p.totalValueLockedUSD),
    apyBase: baseAPR,
    apyReward: apr.isNaN() ? 0 : apr.toNumber(),
    rewardTokens: rewardTokens, // Include rewardTokens in the return object
    underlyingTokens: [p.token0.id, p.token1.id],
    url: `https://app.stellaswap.com/pulsar/add/${p.token0.id}/${p.token1.id}`,
  };
});



  // Filter out pools with invalid or missing fields
  data = data.filter(p => p.pool && p.chain && p.project && p.symbol && p.underlyingTokens.length && p.url);

  return data;
};

const main = async (timestamp = null) => {
  const data = await Promise.all([topLvl('moonbeam', timestamp, urlMoonbeam)]);
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://stellaswap.com/',
};
