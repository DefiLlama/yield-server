const utils = require('../utils');

const ECHELON_DAPP_URL = 'https://app.echelon.market';
const ECHELON_MARKETS_API_URL = `${ECHELON_DAPP_URL}/api/markets?network=`;

const SEC_PER_YEAR = 365 * 24 * 60 * 60;

/**
 * Calculate APRs for farming pools
 * @param {Object} farmingData - The farming data containing rewards and pools
 * @param {Object} coins - Map of coin information by market address
 * @returns {Object} - Object with supply and borrow APRs by market
 */
function calculateFarmingAprsMove(farmingData, coins) {
    try {
      // Convert rewards array to a Map for easier lookup
      const rewardsMap = new Map();
      if (Array.isArray(farmingData.rewards)) {
        farmingData.rewards.forEach(([key, value]) => {
          rewardsMap.set(key, value);
        });
      }
  
      // Process both supply and borrow pools
      const result = {
        supply: {},
        borrow: {}
      };
  
      // Process supply pools
      if (farmingData.pools && Array.isArray(farmingData.pools.supply)) {
        for (const poolData of farmingData.pools.supply) {
          if (!Array.isArray(poolData) || poolData.length < 2) continue;
          
          const [market, pool] = poolData;
          const aprs = [];
          const coinInfo = coins[market];
          
          if (!coinInfo || !coinInfo.price || !pool.stakeAmount || pool.stakeAmount <= 0) {
            continue;
          }
          
          const stakedValue = coinInfo.price * pool.stakeAmount;
          
          if (Array.isArray(pool.rewards)) {
            for (const reward of pool.rewards) {
              if (!reward || !reward.rewardKey || reward.allocPoint <= 0) {
                continue;
              }
              
              const rewardData = rewardsMap.get(reward.rewardKey);
              if (!rewardData || !rewardData.rewardCoin || !rewardData.rewardCoin.price) {
                continue;
              }
              
              const now = Date.now() / 1000;
              if (rewardData.startTime > now || rewardData.endTime < now) {
                continue;
              }
              
              const apr = 
                ((rewardData.rewardPerSec / rewardData.totalAllocPoint) * 
                 reward.allocPoint * 
                 rewardData.rewardCoin.price * 
                 SEC_PER_YEAR) / 
                stakedValue;
              
              aprs.push({
                coin: rewardData.rewardCoin,
                apr: apr
              });
            }
          }
          
          if (aprs.length > 0) {
            result.supply[market] = aprs;
          }
        }
      }
      
      // Process borrow pools
      if (farmingData.pools && Array.isArray(farmingData.pools.borrow)) {
        for (const poolData of farmingData.pools.borrow) {
          if (!Array.isArray(poolData) || poolData.length < 2) continue;
          
          const [market, pool] = poolData;
          const aprs = [];
          const coinInfo = coins[market];
          
          if (!coinInfo || !coinInfo.price || !pool.stakeAmount || pool.stakeAmount <= 0) {
            continue;
          }
          
          const stakedValue = coinInfo.price * pool.stakeAmount;
          
          if (Array.isArray(pool.rewards)) {
            for (const reward of pool.rewards) {
              if (!reward || !reward.rewardKey || reward.allocPoint <= 0) {
                continue;
              }
              
              const rewardData = rewardsMap.get(reward.rewardKey);
              if (!rewardData || !rewardData.rewardCoin || !rewardData.rewardCoin.price) {
                continue;
              }
              
              const now = Date.now() / 1000;
              if (rewardData.startTime > now || rewardData.endTime < now) {
                continue;
              }
              
              const apr = 
                ((rewardData.rewardPerSec / rewardData.totalAllocPoint) * 
                 reward.allocPoint * 
                 rewardData.rewardCoin.price * 
                 SEC_PER_YEAR) / 
                stakedValue;
              
              aprs.push({
                coin: rewardData.rewardCoin,
                apr: apr
              });
            }
          }
          
          if (aprs.length > 0) {
            result.borrow[market] = aprs;
          }
        }
      }
      
      return result;
    } catch (e) {
      return { supply: {}, borrow: {} };
    }
  }

async function main() {
  const netTVLArr = [];
  const chains = ['aptos', 'move', 'echelon_initia'];
  for (const chain of chains) {
    const chainTVLArr = await fetchEchelonForChain(chain);
    netTVLArr.push(...chainTVLArr);
  }

  return netTVLArr;
}

async function fetchEchelonForChain(chain) {
  // We use Echelon's API and not resources on chain as there are too many pools to parse and query
  // for TVL, APR, etc. metrics. This way we fetch all our pools with TVL attached, then can filter.
  const chainNameForRequest = chain === 'aptos' ? 'aptos_mainnet' : chain === 'move' ? 'movement_mainnet' : 'initia_mainnet';
  const response = (await utils.getData(`${ECHELON_MARKETS_API_URL}${chainNameForRequest}`))
      ?.data;
  const markets = response?.assets;
  const marketStats = response?.marketStats;
  const farming = response?.farming;

  const coinInfoByMarket = {};
  for (const market of markets) {
    coinInfoByMarket[market.market] = {
      symbol: market.symbol,
      price: market.price,
      address: market.address || market.faAddress
    };
  }

  const farmingAprs = calculateFarmingAprsMove(farming, coinInfoByMarket);
  
  if (chain === 'echelon_initia') {
    const vipFarmingPools = response?.vipFarming?.pools;
    vipFarmingPools.supply.map((entry) =>{
      const key = entry[0];
      const value = {
        coin: "esINIT",
        apr: entry[1]
      };
      if (farmingAprs.supply[key]) {
        farmingAprs.supply[key].push(value);
      } else {
        farmingAprs.supply[key] = [value];
      }
    });
    vipFarmingPools.borrow.map((entry) =>{
      const key = entry[0];
      const value = {
        coin: "esINIT",
        apr: entry[1]
      };
      if (farmingAprs.borrow[key]) {
        farmingAprs.borrow[key].push(value);
      } else {
        farmingAprs.borrow[key] = [value];
      }
    });
  }

  const tvlArr = [];
  for (const market of markets) {
    const marketAddress = market.market;
    const assetAddress = market.address || market.faAddress;
    const marketSpecificStats = marketStats.find(item => item[0] === assetAddress)[1];
    // Total supply is the sum of cash, reserve, and liability
    const totalSupply = marketSpecificStats?.totalCash + marketSpecificStats?.totalLiability - marketSpecificStats?.totalReserve;
    // Total borrow is the sum of cash, reserve, and liability
    const totalBorrow = marketSpecificStats?.totalLiability;
    const totalSupplyUsd = totalSupply * market.price;
    const totalBorrowUsd = totalBorrow * market.price;
    
    const lendingSupplyApr = market.supplyApr;
    const lendingBorrowApr = market.borrowApr;
    const stakingSupplyApr = market.stakingApr;
    const farmingAPTApr = farmingAprs.supply[marketAddress]?.find(item => item.coin.address === '0x1::aptos_coin::AptosCoin')?.apr;
    const farmingAPTAprBorrow = farmingAprs.borrow[marketAddress]?.find(item => item.coin.address === '0x1::aptos_coin::AptosCoin')?.apr;
    const farmingTHAPTApr = farmingAprs.supply[marketAddress]?.find(item => item.coin.address === '0xfaf4e633ae9eb31366c9ca24214231760926576c7b625313b3688b5e900731f6::staking::ThalaAPT')?.apr;
    const farmingTHAPTAprBorrow = farmingAprs.borrow[marketAddress]?.find(item => item.coin.address === '0xfaf4e633ae9eb31366c9ca24214231760926576c7b625313b3688b5e900731f6::staking::ThalaAPT')?.apr;
    const farmingEsINITApr = farmingAprs.supply[marketAddress]?.find(item => item.coin === 'esINIT')?.apr;
    const farmingEsINITBorrowApr = farmingAprs.borrow[marketAddress]?.find(item => item.coin === 'esINIT')?.apr;
    const rewardTokens = [];

    // Check and push for APT OR MOVE
    if (farmingAPTApr > 0 || farmingAPTAprBorrow > 0) {
        rewardTokens.push('0x1::aptos_coin::AptosCoin');
    }
    // Check and push for thAPT
    if ((farmingTHAPTApr > 0 || farmingTHAPTAprBorrow > 0) && chain === 'aptos') {
      rewardTokens.push('0xfaf4e633ae9eb31366c9ca24214231760926576c7b625313b3688b5e900731f6::staking::ThalaAPT');
    }
    
    if ((farmingEsINITApr > 0 || farmingEsINITBorrowApr > 0) && chain === 'echelon_initia') {
      rewardTokens.push('esINIT');
    }

    if (stakingSupplyApr > 0) {
      // TODO: handle susde on move when its live
      rewardTokens.push(chain === 'aptos' ? '0xb30a694a344edee467d9f82330bbe7c3b89f440a1ecd2da1f3bca266560fce69' : undefined);
    }
    
    tvlArr.push({
      pool:
         `${marketAddress}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'echelon-market',
      apyBase: ((lendingSupplyApr) ?? 0) * 100,
      // exclude intrinsic yield from susde
      apyReward: ((farmingAPTApr ?? 0) + (farmingTHAPTApr ?? 0) + (farmingEsINITApr ?? 0) + (market.symbol.toLowerCase() === 'susde' ? 0 : stakingSupplyApr ?? 0)) * 100,
      apyBaseBorrow: (lendingBorrowApr ?? 0) * 100,
      apyRewardBorrow: ((farmingEsINITBorrowApr ?? 0) + (farmingAPTAprBorrow ?? 0) + (farmingTHAPTAprBorrow ?? 0)) * 100,
      totalSupplyUsd,
      totalBorrowUsd,
      rewardTokens: rewardTokens.filter(token => token !== undefined),
      symbol: market.symbol,
      tvlUsd: (totalSupplyUsd - totalBorrowUsd),
      underlyingTokens: [assetAddress],
      url: `${ECHELON_DAPP_URL}/markets`,
    });
  }

  return tvlArr;
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.echelon.market/markets',
};
