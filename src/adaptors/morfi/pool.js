const { SubgraphService } = require('./subgraph');
const axios = require('axios');
const sdk = require('@defillama/sdk');

const tickToSqrtPrice = (tick) => {
    return Math.sqrt(Math.pow(1.0001, tick));
  };

const getAmounts = (liquidity, tickLower, tickUpper, currentTick) => {
    const currentPrice = tickToSqrtPrice(currentTick);
    const lowerPrice = tickToSqrtPrice(tickLower);
    const upperPrice = tickToSqrtPrice(tickUpper);
  
    let amount0, amount1;
    if (currentPrice < lowerPrice) {
      amount1 = 0;
      amount0 = liquidity * (1 / lowerPrice - 1 / upperPrice);
    } else if (lowerPrice <= currentPrice && currentPrice <= upperPrice) {
      amount1 = liquidity * (currentPrice - lowerPrice);
      amount0 = liquidity * (1 / currentPrice - 1 / upperPrice);
    } else {
      amount1 = liquidity * (upperPrice - lowerPrice);
      amount0 = 0;
    }
    return [amount0, amount1];
  };

 class PoolService {
    subgraphService;

    constructor() {
        this.subgraphService = new SubgraphService();
    }

  calculateLastApr(poolCurrentTvl, poolFee) {

    return poolCurrentTvl ? (poolFee * 365 * 100) / poolCurrentTvl : 0;
  }

  async getPoolsApr() {
    const fetchedPools = await this.subgraphService.getCurrentPoolsInfo();
   

    const poolsTick = {};
    const poolsCurrentTvl = {};
    const poolsFees = {};

    await Promise.all(
      fetchedPools.map(async (fetchedPool) => {
        poolsTick[fetchedPool.id] = parseInt(fetchedPool.tick, 10);
        poolsCurrentTvl[fetchedPool.id] = 0;
        poolsFees[fetchedPool.id] = poolsFees[fetchedPool.id]
          ? poolsFees[fetchedPool.id] + parseFloat(fetchedPool.feesToken0)
          : parseFloat(fetchedPool.feesToken0);
        poolsFees[fetchedPool.id] +=
          parseFloat(fetchedPool.feesToken1) *
          parseFloat(fetchedPool.token0Price);

        const positionInfos = await this.subgraphService.getPositionsByPoolId(
          fetchedPool.id,
        );

        positionInfos.forEach((position) => {
          const currentTick = poolsTick[position.pool.id];
          if (
            parseInt(position.lowerTick.tickIdx, 10) < currentTick &&
            currentTick < parseInt(position.upperTick.tickIdx, 10)
          ) {
            const [amount0, amount1] = getAmounts(
              parseInt(position.liquidity, 10),
              parseInt(position.lowerTick.tickIdx, 10),
              parseInt(position.upperTick.tickIdx, 10),
              currentTick,
            );
            poolsCurrentTvl[position.pool.id] +=
              amount0 / Math.pow(10, parseInt(fetchedPool.token0.decimals, 10));
            poolsCurrentTvl[position.pool.id] +=
              (amount1 /
                Math.pow(10, parseInt(fetchedPool.token1.decimals, 10))) *
              parseFloat(fetchedPool.token0Price);
          }
        });
      }),
    );

   return Promise.all(
    fetchedPools.map(async (pool) => {
      const apr = poolsCurrentTvl[pool.id]
        ? this.calculateLastApr(
            poolsCurrentTvl[pool.id],
            poolsFees[pool.id],
          )
        : 0;
      return {
        pool: pool.id,
        symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
        tvlUsd: pool.totalValueLockedUSD,
        url: `https://app.morfi.io/pool/${pool.id}`,
        apyBase: apr
      }
    }),
  );
  }
}

module.exports = {
    PoolService
}