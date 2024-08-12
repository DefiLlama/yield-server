const BigNumber = require('bignumber.js');
const { gql, request } = require('graphql-request');
const { pulsar, pulsarFarming, pulsarBlocks } = require('./clients')

const {
    queryBlock,
    queryPositions,
    queryFarming,
    queryDeposits,
    queryTokens,
    queryPositionsViaIds
} = require('./queries')

const tickToSqrtPrice = (tick) => {
    // return new BigNumber(Math.sqrt(1.0001 ** tick));
    return Math.sqrt(1.0001 ** tick);

};

exports.getPreviousBlockNumber = async () => {
    const startBlock = 2649799;
    const response = (await request(pulsarBlocks, queryBlock))
    const blockNumber = response.blocks[0]?.number === undefined ? startBlock : response.blocks[0]?.number;
    return blockNumber;
};

exports.getPositionsOfPool = async (poolId) => {
    const result = [];
    let i = 0;
    while (true) {
        const positions = (await request(pulsar, queryPositions.replace('<POOL_ID>', poolId)))
        result.push(...positions.positions);
        if (positions.positions.length < 1000) {
            break;
        }
        i += 1;
    }
    return result;
};

exports.getAmounts = (liquidity, tickLower, tickUpper, currentTick) => {
    const currentPrice = tickToSqrtPrice(currentTick);
    const lowerPrice = tickToSqrtPrice(tickLower);
    const upperPrice = tickToSqrtPrice(tickUpper);
    
    let amount1; let amount0;
    if (currentPrice < lowerPrice) {
      amount1 = 0;
      amount0 = liquidity * (1 / lowerPrice - 1 / upperPrice);
    } else if ((lowerPrice <= currentPrice) && (currentPrice <= upperPrice)) {
      amount1 = liquidity * (currentPrice - lowerPrice);
      amount0 = liquidity * (1 / currentPrice - 1 / upperPrice);
    } else {
      amount1 = liquidity * (upperPrice - lowerPrice);
      amount0 = 0;
    }
    return { amount0, amount1 };
};

exports.getEternalFarmingInfo = async () => {
    const eternalFarmings = await request(pulsarFarming, queryFarming);
    return eternalFarmings.eternalFarmings;
};

exports.getPositionsInEternalFarming = async (farmingId) => {
    const result = [];
    let i = 0;
    while (true) {
        const positions = (await request(pulsarFarming, queryDeposits.replace('<FARMING_ID>', farmingId)))
        result.push(...positions.deposits);
        if (positions.deposits.length < 1000) {
            break;
        }
        i += 1;
    }
    return result;
};

exports.getTokenInfoByAddress = async (tokenAddress) => {
    const tokens = (await request(pulsar, queryTokens.replace('<TOKEN_ADDRESS>', tokenAddress)))
    return tokens.tokens;
};

exports.getPositionsById = async (tokenIds) => {
    tokenIds = tokenIds.map((tokenId) => tokenId.id);
    const result = [];
    let i = 0;
    while (true) {
        const positions = (await request(pulsar, queryPositionsViaIds.replace('<TOKEN_IDS>', JSON.stringify(tokenIds))))
        result.push(...positions.positions);
        if (positions.positions.length < 1000) {
            break;
        }
        i += 1;
    }
    return result;
};

exports.getCurrentPoolsInfo = async () => {
    const prevBlockNumber = await exports.getPreviousBlockNumber();
    const queryString = `
    {
      pools(block: {number: ${prevBlockNumber}}, first: 1000, orderBy: id) {
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
    const previousPools = await request(pulsar, gql`${queryString}`);
    const poolsJsonPrevious = {};
    for (const pool of previousPools.pools) {
      poolsJsonPrevious[pool.id] = { feesToken0: pool.feesToken0, feesToken1: pool.feesToken1 };
    }

    const queryStringNew = `{
      pools(first: 1000, orderBy: id) {
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
    const pools = await request(pulsar, gql`${queryStringNew}`);

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
};