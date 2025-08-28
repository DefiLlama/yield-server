const axios = require('axios');
const sdk = require("@defillama/sdk");

// Token addresses
const SPRK_TOKEN = '0x657097cC15fdEc9e383dB8628B57eA4a763F2ba0';
const XSPRK_TOKEN = '0xB5Dc569d06be81Eb222a00cEe810c42976981986';
const DIVIDENDS_SC = '0x710a578356A3Dfa7C207B839D3E244807b2f5AFE';

// Epoch duration: 7 days
const EPOCH_DURATION_DAYS = 7;

// Load ABI from file
const dividendsABI = require('./dividends-abi.json').abi;

const apy = async () => {
  try {
    // Get distributed tokens length from smart contract
    const distributedTokensLengthResult = await sdk.api.abi.call({
      target: DIVIDENDS_SC,
      abi: dividendsABI.find(item => item.name === 'distributedTokensLength'),
      chain: "flare",
    });
    
    if (!distributedTokensLengthResult.output || parseInt(distributedTokensLengthResult.output) === 0) {
      return [];
    }

    const distributedTokensLength = parseInt(distributedTokensLengthResult.output);
    const distributedTokens = [];
    
    // Get all distributed tokens
    for (let i = 0; i < distributedTokensLength; i++) {
      try {
        const tokenResult = await sdk.api.abi.call({
          target: DIVIDENDS_SC,
          abi: dividendsABI.find(item => item.name === 'distributedToken'),
          params: [i],
          chain: "flare",
        });
        
        if (tokenResult.output && tokenResult.output !== '0x0000000000000000000000000000000000000000') {
          distributedTokens.push(tokenResult.output);
        }
      } catch (error) {
        console.log(`Error getting distributed token at index ${i}:`, error.message);
      }
    }
    
    if (distributedTokens.length === 0) {
      return [];
    }

    // Get total allocation (xSPRK amount) from smart contract
    const totalAllocationResult = await sdk.api.abi.call({
      target: DIVIDENDS_SC,
      abi: dividendsABI.find(item => item.name === 'totalAllocation'),
      chain: "flare",
    });
    
    if (!totalAllocationResult.output || parseInt(totalAllocationResult.output) === 0) {
      return [];
    }

    // Get xSPRK decimals
    const xSprkDecimalsResult = await sdk.api.abi.call({
      target: XSPRK_TOKEN,
      abi: "uint8:decimals",
      chain: "flare",
    });
    
    const xSprkDecimals = parseInt(xSprkDecimalsResult.output);
    const totalAllocation = parseInt(totalAllocationResult.output) / Math.pow(10, xSprkDecimals);

    // Get SPRK price from DefiLlama (since SPRK and xSPRK are 1:1)
    const sprkPrice = await getTokenPrice(SPRK_TOKEN);
    
    if (!sprkPrice) {
      return [];
    }

    // Calculate TVL in USD
    const tvlUsd = totalAllocation * sprkPrice;

    // Calculate total current distribution USD amount
    let totalCurrentDistributionUsd = 0;
    
    for (const tokenAddress of distributedTokens) {
      try {
        // Get dividends info from smart contract
        const dividendsInfoResult = await sdk.api.abi.call({
          target: DIVIDENDS_SC,
          abi: dividendsABI.find(item => item.name === 'dividendsInfo'),
          params: [tokenAddress],
          chain: "flare",
        });
        
        if (dividendsInfoResult.output && dividendsInfoResult.output.length > 0) {
          const currentDistributionRaw = dividendsInfoResult.output[0]; // currentDistributionAmount
          
          if (currentDistributionRaw && parseInt(currentDistributionRaw) > 0) {
            // Get token decimals (assuming most tokens have 18 decimals for now)
            // In production, you might want to fetch this from each token contract
            const tokenDecimals = 18; // Default assumption
            const currentDistribution = parseInt(currentDistributionRaw) / Math.pow(10, tokenDecimals);
            
            if (currentDistribution > 0) {
              // Get token price
              const tokenPrice = await getTokenPrice(tokenAddress);
              
              if (tokenPrice) {
                // Calculate current distribution USD amount
                const distributionUsd = currentDistribution * tokenPrice;
                totalCurrentDistributionUsd += distributionUsd;
              }
            }
          }
        }
      } catch (error) {
        console.log(`Error getting dividends info for token ${tokenAddress}:`, error.message);
      }
    }

    // Calculate APR (not APY since it's not auto-compounding)
    // APR = (current distribution USD / TVL USD) * (365 days / epoch duration) * 100
    const apr = totalCurrentDistributionUsd > 0 && tvlUsd > 0 
      ? (totalCurrentDistributionUsd / tvlUsd) * (365 / EPOCH_DURATION_DAYS) * 100 
      : 0;

    // Create pool object
    const pool = {
      pool: `${XSPRK_TOKEN}-flare`.toLowerCase(),
      symbol: 'xSPRK',
      project: 'sparkdex',
      chain: 'flare',
      tvlUsd,
      apyBase: apr, // Using APR since it's not auto-compounding
      underlyingTokens: [XSPRK_TOKEN],
      rewardTokens: distributedTokens.filter(token => token !== XSPRK_TOKEN), // All distributed tokens except xSPRK
      url: 'https://sparkdex.ai/stake',
    };

    return [pool];
  } catch (error) {
    console.error('Error in SparkDEX adapter:', error);
    return [];
  }
};

// Helper function to get token price from DefiLlama
async function getTokenPrice(tokenAddress) {
  try {
    // Use DefiLlama price API
    const response = await axios.get(`https://coins.llama.fi/prices/current/flare:${tokenAddress}`);
    
    if (response.data && response.data.coins && response.data.coins[`flare:${tokenAddress}`]) {
      return response.data.coins[`flare:${tokenAddress}`].price;
    }
    
    // Fallback: try to get price from FlareMetrics
    try {
      const flareMetricsResponse = await axios.get(`https://api.flaremetrics.io/v2/defi/flare/price?token=${tokenAddress}`);
      if (flareMetricsResponse.data && flareMetricsResponse.data.price) {
        return flareMetricsResponse.data.price;
      }
    } catch (flareMetricsError) {
      console.log(`FlareMetrics price fetch failed for ${tokenAddress}:`, flareMetricsError.message);
    }
    
    // If all else fails, return null
    return null;
  } catch (error) {
    console.error(`Error getting price for token ${tokenAddress}:`, error.message);
    return null;
  }
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://sparkdex.ai/stake',
};
