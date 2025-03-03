const fetch = require('node-fetch');
const curve = require('../curve-dex');
const { default: BigNumber } = require('bignumber.js');

const chainIdMap = {
  146: 'Sonic',
  250: 'Fantom',
  42161: 'Arbitrum',
}

const getGauges = async () => {
  try {
    const response = await fetch('https://eywa-bot-api-service.eywa.fi/gauges/0x0000000000000000000000000000000000000000', {
      timeout: 5000
    });
    
    if (!response.ok) {
      throw new Error(response.status);
    }
    
    const jsonData = await response.json();
    
    if (!jsonData.data) {
      return [];
    }
    
    return jsonData.data;

  } catch (error) {
    console.error(error);
    return [];
  }
};

const merkl = async () => {
  try {
    const response = await fetch('https://api.merkl.xyz/v3/opportunity?campaigns=true&testTokens=false', {
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(response.status);
    }
    
    const merklData = await response.json();
        
    return Object.values(merklData);
  } catch (error) {
    console.error(error);
    return [];
  }
}

const resolveMerklPool = (merklData, address) => {
  const data = merklData.find((pool) => pool.campaigns.active[0]?.campaignParameters?.targetToken?.toLowerCase() === address && pool.status === 'live');

  if (!data)
    return;

  // if (data.status === 'live') {
    return data;
  // }

  // return merklData.find((pool) => pool.platform === data.platform && pool.status === 'live');
}

// Main Function
const main = async () => {
  try {
    const gauges = await getGauges();
    const addresses = Object.keys(gauges);
    const curveData = await curve.apy();
    const merklData = await merkl();

    return addresses.map((address) => {
      const curvePool = curveData.find((pool) => pool.pool.split('-').at(0).toLowerCase() === address);
      const merklPool = resolveMerklPool(merklData, address);
      const gauge = gauges[address];
      const rewardTokens = []

      if (Array.isArray(curvePool?.rewardTokens)) {
        rewardTokens.push(...curvePool.rewardTokens)
      }

      if (Array.isArray(merklPool?.rewardTokenIcons)) {
        rewardTokens.push(...merklPool.rewardTokenIcons)
      }

      const underlyingTokens = []

      if (Array.isArray(curvePool?.underlyingTokens)) {
        underlyingTokens.push(...curvePool.underlyingTokens)
      }

      if (Array.isArray(merklPool?.underlyingTokens)) {
        underlyingTokens.push(...merklPool.underlyingTokens)
      }

      return {
        pool: address,
        chain: curvePool?.chain || chainIdMap[merklPool?.chainId],
        project: 'crosscurve-(by-eywa)',
        symbol: curvePool?.symbol || merklPool?.platform,
        apy: new BigNumber(curvePool?.apyReward || 0)
          .plus(curvePool?.apyBase || 0)
          .plus(new BigNumber(1).div(gauge.totalDeposited.boosted).multipliedBy(merklPool?.dailyrewards || 0).multipliedBy(365).multipliedBy(100))
          .toNumber(),
        tvlUsd: new BigNumber(curvePool?.tvlUsd || 0).plus(merklPool?.tvlUsd || 0).toNumber(),
        rewardTokens: Array.from(new Set(rewardTokens.map( address => address.toLowerCase()))),
        underlyingTokens: Array.from(new Set(underlyingTokens.map( address => address.toLowerCase()))),
      };
    });
  } catch (error) {
    console.log(error)
  }
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.crosscurve.fi/farm'
};
