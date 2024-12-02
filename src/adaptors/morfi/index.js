const { FarmingService } = require('./farming');
const { PoolService } = require('./pool');

const main = async (timestamp = null) => {
    const farmingService = new FarmingService();
    const poolService = new PoolService();
  
    const farmings = await farmingService.getEternalFarmingsApr();
    const pools = await poolService.getPoolsApr();
  
    // Merge APY data from farming and pool based on contract address
    const mergedData = pools.map(poolData => {
      const farmingData = farmings?.find(farming => farming.pool === poolData.pool);
      return {
        project: 'morfi',
        chain: 'Morph',
        pool: poolData.pool,  // Add pool address
        symbol: poolData.symbol,  // Add pool symbol
        tvlUsd: Number(poolData.tvlUsd),  // Add TVL
        url: poolData.url,  // Add URL
        apyBase: poolData.apyBase || 0,
        apyReward: farmingData?.apyReward || 0,
        ...(farmingData?.rewardTokens?.length > 0 && { rewardTokens: farmingData.rewardTokens })
      };
    });
  
    return mergedData;
  }

module.exports = {
    timetravel: false,
    apy: main,
  };
  