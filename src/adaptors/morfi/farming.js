const { SubgraphService } = require('./subgraph');
const axios = require('axios');

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

class FarmingService {
    subgraphService;

    constructor() {
        this.subgraphService = new SubgraphService();
    }
  
    async update() {
      await this.updateEternalFarmingsApr(2818);
    }
  
    async getEternalFarmingsApr() {
      const farmings = await this.subgraphService.getEternalFarmingInfo();
  
      return Promise.all(
        farmings.map(async (farming) => {
          const deposits =
            await this.subgraphService.getPositionsInEternalFarming(
              farming.id,
            );
          const positionIds = deposits.map((deposit) => deposit.id);

          const token0Info = await this.subgraphService.getTokenInfoByAddress(
            farming.rewardToken,
          );

          const positions =
            await this.subgraphService.getPositionsByIds(positionIds);

          const totalNativeAmount = positions.reduce((acc, position) => {
            const [amount0, amount1] = getAmounts(
              parseInt(position.liquidity, 10),
              parseInt(position.tickLower.tickIdx, 10),
              parseInt(position.tickUpper.tickIdx, 10),
              parseInt(position.pool.tick, 10),
            );
            const amount0InEth =
              (amount0 * parseFloat(position.pool.token0.derivedEth)) /
              Math.pow(10, parseInt(position.pool.token0.decimals, 10));
            const amount1InEth =
              (amount1 * parseFloat(position.pool.token1.derivedEth)) /
              Math.pow(10, parseInt(position.pool.token1.decimals, 10));
            return acc + amount0InEth + amount1InEth;
          }, 0);

          let rewardPerSecond =
            (parseInt(farming.rewardRate) *
              parseFloat(token0Info.derivedEth)) /
            Math.pow(10, parseInt(token0Info.decimals, 10));

          if (farming.bonusRewardToken !== '0x0000000000000000000000000000000000000000') {
            const token1Info =
              await this.subgraphService.getTokenInfoByAddress(
                farming.bonusRewardToken,
              );
            rewardPerSecond +=
              (parseInt(farming.bonusRewardRate) *
                parseFloat(token1Info.derivedEth)) /
              Math.pow(10, parseInt(token1Info.decimals, 10));
          }

          const apr =
            totalNativeAmount > 0
              ? (rewardPerSecond * 86400 * 365 * 100) / totalNativeAmount
              : 0;

          return {
            pool: farming.pool,
            apyReward: apr,
            rewardTokens: [
              farming.rewardToken,
              ...(farming.bonusRewardToken !== '0x0000000000000000000000000000000000000000' ? [farming.bonusRewardToken] : [])
            ]
          }
        }),
      );
    }
  }

module.exports = {
    FarmingService
}