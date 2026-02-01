const axios = require('axios');
const utils = require('../utils');

const CHAIN_CODES = [
  "ethereum",
  'arbitrum',
  'base',
  'optimism',
  'polygon',
  'avalanche',
  'bsc',
  'hyperevm',
  'unichain',
  'linea',
  'ronin',
  'mantle',
  'sonic',
  'berachain'
]
const BASE_URL = 'https://kd-market-service-api.kyberengineering.io/';

const topLvl = async (timestamp) => {
  try {
    const allPools = [];

    // Loop through each chain
    for (const chain of CHAIN_CODES) {
      try {
        // Fetch all pools from the exchange for this chain
        const poolsResponse = await axios.get(`${BASE_URL}${chain}/api/v1/pools?exchange=kem_univ4_fairflow%`);
        const pools = poolsResponse.data.data;
        if (chain === 'bsc') {
            // Call pool with exchange = kem_pancake_infinity_cl_fairflow_eg_lm and append to pools
            const pancakePoolsResponse = await axios.get(`${BASE_URL}${chain}/api/v1/pools?exchange=kem_pancake_infinity_cl_fairflow_eg_lm`);
            const pancakePools = pancakePoolsResponse.data.data;
            if (pancakePools.length > 0) {
              pools.push(...pancakePools);
            }
        }  
        
        // Fetch pool state data for each pool
        const poolAddresses = pools.map(pool => pool.poolAddress);
        
        const poolStateResponse = await axios.get(`${BASE_URL}${chain}/api/v1/poolState?addresses=${poolAddresses.join(',')}`);
        const poolStates = poolStateResponse.data.data;

        // Create a map for quick lookup
        const poolStateMap = {};
        poolStates.forEach(state => {
          poolStateMap[state.poolAddress] = state;
        });

        // Process pools for this chain
        const chainPools = pools.map(pool => {
          const poolState = poolStateMap[pool.poolAddress];
          
          if (!poolState) {
            return null;
          }

          // Extract APY data
          const apr = poolState.apr || {};
          const kemLMApr = poolState.kemLMApr || {};
          const kemEGApr = poolState.kemEGApr || {};

          // Calculate APY values
          const apyBase = parseFloat(apr['7d']) || 0;
          const apyReward = (parseFloat(kemLMApr['7d']) || 0) + (parseFloat(kemEGApr['7d']) || 0);

          // Get token symbols and addresses
          const token0 = poolState.token0 || {};
          const token1 = poolState.token1 || {};
          
          let symbol = '';
          let underlyingTokens = [];
          
          if (token0.symbol && token1.symbol) {
            symbol = utils.formatSymbol(`${token0.symbol}-${token1.symbol}`);
            underlyingTokens = [token0.address, token1.address];
          } else if (token0.symbol) {
            symbol = utils.formatSymbol(token0.symbol);
            underlyingTokens = [token0.address];
          } else if (token1.symbol) {
            symbol = utils.formatSymbol(token1.symbol);
            underlyingTokens = [token1.address];
          } else {
            symbol = 'UNKNOWN';
            underlyingTokens = [];
          }

          // Get reward tokens if they exist
          const rewardTokens = [];
          if (poolState.tokenReward && poolState.tokenReward.all && poolState.tokenReward.all.length > 0) {
            poolState.tokenReward.all.forEach(reward => {
              if (reward.tokenInfo && reward.tokenInfo.address) {
                rewardTokens.push(reward.tokenInfo.address);
              }
            });
          }

          return {
            pool: `${pool.poolAddress}-${chain}`,
            chain: utils.formatChain(chain),
            project: 'kyberswap-fairflow',
            symbol,
            tvlUsd: parseFloat(pool.tvlUsd) || 0,
            apyBase,
            apyReward,
            rewardTokens: rewardTokens.length > 0 ? rewardTokens : undefined,
            underlyingTokens,
            poolMeta: 'Univ4 Kyber FairFlow',
          };
        }).filter(pool => pool !== null && utils.keepFinite(pool));

        allPools.push(...chainPools);
      } catch (chainError) {
        console.error(`Error fetching data for chain ${chain}:`, chainError);
        // Continue with other chains even if one fails
        continue;
      }
    }

    return allPools;
  } catch (e) {
    console.error('Error fetching KyberSwap Fairflow data:', e);
    return [];
  }
};

const main = async (timestamp = null) => {
  return await topLvl(timestamp);
};

module.exports = {
  apy: main,
  timetravel: false,
  url: 'https://kyberswap.com/pools',
};
