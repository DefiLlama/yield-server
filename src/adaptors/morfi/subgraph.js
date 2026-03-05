const axios = require('axios');
const { coreUrl, farmUrl, blocksUrl } = require('./config');
const { findToken, findEternalFarmingInfos, getPositionsInEternalFarming, getPreviousBlockNumber, getPools, getPositionsByIds, getPositionsByPoolId, getPoolsByBlockNumber } = require('./gql-requests');

const APR_DELTA = 86400;

const BLOCK_DELTA = 60;

class SubgraphService {
    async sendGqlRequest(url, query, params) {
      const response = await axios.post(url, { query, variables: params });
      return response.data;
    }
  
    async getTokenInfoByAddress(address) {
      const response = await this.sendGqlRequest(coreUrl, findToken, {
        address,
      });
      return response.data.token;
    }
  
    async getEternalFarmingInfo() {
      const response = await this.sendGqlRequest(
        farmUrl,
        findEternalFarmingInfos,
      );
      return response.data.eternalFarmings;
    }
  
    async getPositionsInEternalFarming(
      eternalFarmingId,
    ){
      const response = await this.sendGqlRequest(
        farmUrl,
        getPositionsInEternalFarming,
        {
          eternalFarming: eternalFarmingId,
        },
      );
      return response.data.deposits;
    }
    
    async getPositionsByIds(positionIds) {
      const response = await this.sendGqlRequest(coreUrl, getPositionsByIds, {
        id_in: positionIds,
      });
      return response.data.positions;
    }
  
    async getPositionsByPoolId(poolId) {
      const response = await this.sendGqlRequest(coreUrl, getPositionsByPoolId, {
        pool: poolId,
      });
      return response.data.poolPositions;
    }
  
    async getCurrentPoolsInfo() {
      const previousBlockNumber = await this.getPreviousBlockNumber();
      const previousPoolsResponse = await this.sendGqlRequest(
        coreUrl,
        getPoolsByBlockNumber,
        {
          blockNumber: previousBlockNumber,
        },
      );
      const previousPools = previousPoolsResponse.data.pools;
      const currentPoolsResponse = await this.sendGqlRequest(coreUrl, getPools);
      const currentPools = currentPoolsResponse.data.pools;
      const poolMap = previousPools.reduce((acc, pool) => {
        acc[pool.id] = {
          feesToken0: parseFloat(pool.feesToken0),
          feesToken1: parseFloat(pool.feesToken1),
          liquidity: pool.liquidity,
        };
        return acc;
      }, {});
      const updatedPools = currentPools.map((pool) => {
        const previousPool = poolMap[pool.id];
        if (previousPool) {
          pool.feesToken0 = (
            parseFloat(pool.feesToken0) - previousPool.feesToken0
          ).toString();
          pool.feesToken1 = (
            parseFloat(pool.feesToken1) - previousPool.feesToken1
          ).toString();
        } else {
          pool.feesToken0 = parseFloat(pool.feesToken0).toString();
          pool.feesToken1 = parseFloat(pool.feesToken1).toString();
        }
        return pool;
      });
      return updatedPools;
    }
  
    async getPreviousBlockNumber() {
      const previousDate = Math.floor(Date.now() / 1000) - APR_DELTA;
      const timestampLt = previousDate;
      const timestampGt = previousDate - BLOCK_DELTA;
      const response = await this.sendGqlRequest(
        blocksUrl,
        getPreviousBlockNumber,
        { timestampLt, timestampGt },
      );
      const blocks = response.data.blocks;
      if (!blocks || blocks.length === 0) {
        throw new Error(ErrorMessage.MSG_BLOCK_NOT_FOUND);
      }
      const blockNumber = parseInt(blocks[0].number);
      return blockNumber;
    }
  }

module.exports = {
    SubgraphService
}