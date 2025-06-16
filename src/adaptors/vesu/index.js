const utils = require('../utils');
const { call } = require('../../helper/starknet');
const { assetConfigAbi, interestRateAbi } = require('./abi');

const API_URL = 'https://api.vesu.xyz/markets';
const SINGLETON_CONTRACT = '0x000d8d6dfec4d33bfb6895de9f3852143a17c6f92fd2a21da3d6924d34870160';

const poolsFunction = async () => {
  const markets = await utils.getData(API_URL);
  const pools = [];
  
  for (const market of markets.data) {
    const { pool, stats, symbol, decimals, usdPrice, address } = market;
    
    try {
      // Skip if no supply or null price
      if (!stats.totalSupplied?.value || 
          stats.totalSupplied.value === '0' ||
          !usdPrice?.value) {
        continue;
      }
      
      // Calculate TVL
      const totalSuppliedToken = Number(stats.totalSupplied.value) / Math.pow(10, decimals);
      const priceUsd = Number(usdPrice.value) / Math.pow(10, usdPrice.decimals);
      const tvlUsd = totalSuppliedToken * priceUsd;
      
      // Use API data for APY (already calculated correctly by Vesu)
      const supplyAPY = Number(stats.supplyApy.value) / Math.pow(10, stats.supplyApy.decimals) * 100;
      const borrowAPY = Number(stats.borrowApr?.value || 0) / Math.pow(10, stats.borrowApr?.decimals || 18) * 100;
      const supplyRewardsAPR = Number(stats.defiSpringSupplyApr.value) / Math.pow(10, stats.defiSpringSupplyApr.decimals) * 100;
      
      // Calculate borrow data
      const totalDebtToken = Number(stats.totalDebt?.value || 0) / Math.pow(10, decimals);
      const totalBorrowUsd = totalDebtToken * priceUsd;
      
      // Create pool entry
      const poolData = {
        pool: `${pool.id}-${symbol}-starknet`,
        chain: 'Starknet',
        project: 'vesu',
        symbol: symbol,
        tvlUsd: tvlUsd,
        apyBase: supplyAPY > 0 ? supplyAPY : null,
        apyReward: supplyRewardsAPR > 0 ? supplyRewardsAPR : null,
        apyBaseBorrow: borrowAPY > 0 ? borrowAPY : null,
        apyRewardBorrow: null,
        totalSupplyUsd: tvlUsd,
        totalBorrowUsd: totalBorrowUsd,
        underlyingTokens: [address],
        url: `https://app.vesu.xyz/pool/${pool.id}`,
      };
      
      // Add rewardTokens if there are rewards
      if (supplyRewardsAPR > 0) {
        // Assuming STRK token for DeFi Spring rewards
        // You may need to adjust this based on actual reward token from API
        poolData.rewardTokens = ['0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d']; // STRK token address
      }
      
      pools.push(poolData);
      
    } catch (error) {
      console.error(`Error processing market ${pool.id}-${symbol}:`, error);
      continue;
    }
  }
  
  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.vesu.xyz',
};