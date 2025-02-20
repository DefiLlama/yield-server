const utils = require('../utils');

const MASTERCHEF = '0x8a8fde5d57725f070bfc55cd022b924e1c36c8a0';

const gammaPools = [
  { 
    address: '0x52ee1FFBA696c5E9b0Bc177A9f8a3098420EA691',
    symbol: 'WBTC-WETH',
    underlyingTokens: ['0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f','0x82aF49447D8a07e3bd95BD0d56f35241523fBab1']
  },
  { 
    address: '0x6B7635b7d2E85188dB41C3c05B1efa87B143fcE8', 
    symbol: 'WETH-ARB',
    underlyingTokens: ['0x82aF49447D8a07e3bd95BD0d56f35241523fBab1','0x912CE59144191C1204E64559FE8253a0e49E6548']
  },
  { 
    address: '0xfA392dbefd2d5ec891eF5aEB87397A89843a8260',
    symbol: 'WETH-LINK',
    underlyingTokens: ['0x82aF49447D8a07e3bd95BD0d56f35241523fBab1','0xf97f4df75117a78c1A5a0DBb814Af92458539FB4']
  },
  { 
    address: '0xF08BDBC590C59cb7B27A8D224E419ef058952b5f',
    symbol: 'WETH-GMX',
    underlyingTokens: ['0x82aF49447D8a07e3bd95BD0d56f35241523fBab1','0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a']
  },
  { 
    address: '0x2BCBDD577616357464CFe307Bc67F9e820A66e80',
    symbol: 'RDNT-WETH',
    underlyingTokens: ['0x3082CC23568eA640225c2467653dB90e9250AaA0','0x82aF49447D8a07e3bd95BD0d56f35241523fBab1']
  },
  { 
    address: '0x547a116a2622876ce1c8d19d41c683c8f7bec5c0',
    symbol: 'USDs-USDC',
    underlyingTokens: ['0x2Ea0bE86990E8Dac0D09e4316Bb92086F304622d','0xaf88d065e77c8cC2239327C5EDb3A432268e5831']
  }
];

const getApy = async () => {
  const poolData = await utils.getData('https://wire3.gamma.xyz/frontend/hypervisors/allDataSummary?chain=arbitrum&protocol=uniswapv3');
  const rewardData = await utils.getData('https://wire2.gamma.xyz/arbitrum/allRewards2');
  return poolData.filter(result => gammaPools.map(pool => pool.address.toLowerCase()).includes(result.address.toLowerCase()))
    .map(pool => {
      const gammaPool = gammaPools.filter(p => p.address.toLowerCase() === pool.address)[0];
      const poolRewardData = rewardData[MASTERCHEF].pools[pool.address];
      let poolRewardTokens = [];
      if (pool.rewardsDetails) {
        poolRewardTokens = [ ... poolRewardTokens, ... pool.rewardsDetails.map(reward => reward.rewardToken) ]
      }
      
      return {
        pool: `${gammaPool.symbol}-arbitrum`,
        chain: 'Arbitrum',
        project: 'the-standard',
        symbol: gammaPool.symbol,
        tvlUsd: parseFloat(pool.tvlUSD),
        apyBase: pool.feeApr,
        apyReward: pool.rewardApr,
        rewardTokens: poolRewardTokens,
        underlyingTokens: gammaPool.underlyingTokens
      };
    });
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.thestandard.io',
};