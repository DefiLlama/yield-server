const utils = require('../utils');
const { call } = require('./starknet-helper');
const singletonAbi = require('./abi/singletonAbi');
const extensionAbi = require('./abi/extensionAbi');

const API_URL = 'https://api.vesu.xyz/markets';
const SINGLETON_CONTRACT = '0x000d8d6dfec4d33bfb6895de9f3852143a17c6f92fd2a21da3d6924d34870160';
const EXTENSION_CONTRACT = '0x4e06e04b8d624d039aa1c3ca8e0aa9e21dc1ccba1d88d0d650837159e0ee054';

const poolsFunction = async () => {
  const markets = await utils.getData(API_URL);
  const pools = [];
  
  // Extract ABI functions once (they're constant)
  const assetConfigAbi = singletonAbi
    .find(item => item.type === 'interface' && item.name === 'vesu::v2::singleton_v2::ISingletonV2')
    .items.find(fn => fn.name === 'asset_config_unsafe');
  
  const extensionInterface = extensionAbi.find(item => 
    item.type === 'interface' && 
    item.name === 'vesu::extension::interface::IExtension'
  );
  const interestRateAbi = extensionInterface?.items.find(fn => fn.name === 'interest_rate');
  
  for (const market of markets.data) {
    const { pool, stats, symbol, decimals, usdPrice, address } = market;
    
    try {
      if (!stats.totalSupplied?.value || 
          stats.totalSupplied.value === '0' ||
          !usdPrice?.value) {
        continue;
      }
      
      const totalSuppliedToken = Number(stats.totalSupplied.value) / Math.pow(10, decimals);
      const priceUsd = Number(usdPrice.value) / Math.pow(10, usdPrice.decimals);
      const totalSupplyUsd = totalSuppliedToken * priceUsd;
      
      const supplyRewardsAPR = Number(stats.defiSpringSupplyApr.value) / Math.pow(10, stats.defiSpringSupplyApr.decimals) * 100;
      
      const totalDebtToken = Number(stats.totalDebt?.value || 0) / Math.pow(10, decimals);
      const totalBorrowUsd = totalDebtToken * priceUsd;
      
      const rawResponse = await call({
        target: SINGLETON_CONTRACT,
        abi: assetConfigAbi,
        params: [pool.id, address]
      });
      
      if (!rawResponse || rawResponse.length < 2) {
        continue;
      }
      
      const [assetConfigStruct, additionalValue] = rawResponse;
      
      const totalNominalDebt = assetConfigStruct.total_nominal_debt;
      const lastRateAccumulator = assetConfigStruct.last_rate_accumulator;
      const reserve = assetConfigStruct.reserve;
      const lastUpdated = Number(assetConfigStruct.last_updated);
      const lastFullUtilizationRate = assetConfigStruct.last_full_utilization_rate;
      
      const totalDebt = totalNominalDebt * lastRateAccumulator / BigInt(1e18);
      const totalSupplied = totalDebt + reserve;
      const utilization = totalSupplied > 0n ? Number(totalDebt * BigInt(1e18) / totalSupplied) / 1e18 : 0;
      
      let supplyAPY = 0;
      let borrowAPY = 0;
      
      if (interestRateAbi) {
        const borrowRateResponse = await call({
          target: EXTENSION_CONTRACT,
          abi: interestRateAbi,
          params: [
            pool.id, 
            address, 
            Math.floor(utilization * 1e18).toString(), 
            lastUpdated.toString(), 
            lastFullUtilizationRate.toString()
          ]
        });
        
        if (borrowRateResponse && borrowRateResponse[0]) {
          const borrowRatePerSecond = Number(borrowRateResponse[0]) / 1e18;
          const borrowAPYDecimal = Math.pow(1 + borrowRatePerSecond, 365.25 * 24 * 3600) - 1;
          borrowAPY = borrowAPYDecimal * 100;
          
          const supplyAPYDecimal = utilization * borrowAPYDecimal;
          supplyAPY = supplyAPYDecimal * 100;
        }
      }
      
      const poolData = {
        pool: `${pool.id}-${symbol}-starknet`,
        chain: 'Starknet',
        project: 'vesu',
        symbol: symbol,
        tvlUsd: totalSupplyUsd - totalBorrowUsd,
        apyBase: supplyAPY > 0 ? supplyAPY : null,
        apyReward: supplyRewardsAPR > 0 ? supplyRewardsAPR : null,
        apyBaseBorrow: borrowAPY > 0 ? borrowAPY : null,
        apyRewardBorrow: null,
        totalSupplyUsd: totalSupplyUsd,
        totalBorrowUsd: totalBorrowUsd,
        underlyingTokens: [address],
        url: "https://vesu.xyz/markets",
        poolMeta: symbol,
      };
      
      if (supplyRewardsAPR > 0) {
        poolData.rewardTokens = ['0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'];
      }
      
      pools.push(poolData);
      
    } catch (error) {
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