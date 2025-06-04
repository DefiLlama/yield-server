const utils = require('../utils');

const poolsFunction = async () => {
  try {
    const response = await utils.getData('https://api.infinifi.xyz/api/protocol/data');
    const data = response.data;
    
    const pools = [];
    const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    
    
    if (data.stats.siusd) {
      const siusdData = data.stats.siusd;
      const tvl = siusdData.totalSupplyNormalized || 0;
      const apy = (siusdData.lastWeekAPY || 0) * 100;
      
      if (tvl > 10000) {
        pools.push({
          pool: `${siusdData.address}-ethereum`.toLowerCase(),
          chain: utils.formatChain('ethereum'),
          project: 'infinifi',
          symbol: utils.formatSymbol('siUSD'),
          tvlUsd: tvl,
          apy: apy,
          underlyingTokens: [USDC_ADDRESS],
          poolMeta: 'Staked iUSD',
          url: 'https://infinifi.xyz/',
        });
      }
    }
    
    if (data.stats.liusd) {
      Object.values(data.stats.liusd).forEach((liusdToken) => {
        const tvl = liusdToken.totalSupplyNormalized || 0;
        const apy = (liusdToken.lastWeekAPY || 0) * 100;
        const weeks = liusdToken.bucketMaturity;
        
        if (tvl > 10000) {
          pools.push({
            pool: `${liusdToken.address}-ethereum`.toLowerCase(),
            chain: utils.formatChain('ethereum'),
            project: 'infinifi',
            symbol: utils.formatSymbol(liusdToken.name),
            tvlUsd: tvl,
            apy: apy,
            underlyingTokens: [USDC_ADDRESS],
            poolMeta: `Locked iUSD - ${weeks} week${weeks > 1 ? 's' : ''}`,
            url: 'https://infinifi.xyz/',
          });
        }
      });
    }
    
    return pools;
    
  } catch (error) {
    console.error('Error fetching infiniFi data:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://infinifi.xyz/',
};
