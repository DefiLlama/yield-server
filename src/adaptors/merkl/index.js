const sdk = require('@defillama/sdk');
const utils = require('../utils');

const networks = {
  1: 'ethereum',
  137: 'polygon',
  10: 'optimism',
  42161: 'arbitrum',
  1101: 'polygon_zkevm',
  8453: 'base',
  60808: 'bob',
};

// Protocols that should not be listed under Merkl
// as they already have their own adapters.
const protocolsBlacklist = [
  'euler',
  'crosscurve',
  'aerodrome',
  'gamma',
];

// Allow specific pools from blacklisted protocols
const poolsWhitelist = [
  // Pool from Aerodrome CL: xPufETH-WETH
  '0xCDf927C0F7b81b146C0C9e9323eb5A28D1BFA183',
];

async function getRateAngle(token) {
  const prices = await utils.getData('https://api.angle.money/v1/prices/');
  const price = prices.filter((p) => p.token == token)[0]?.rate;
  return price;
}

// function getting all the data from the Angle API
const main = async () => {
  var poolsData = [];

  const project = 'merkl';

  for (const chainId of Object.keys(networks)) {
    const chain = networks[chainId];

    let pools = [];
    let pageI = 0;

    while(true) {
      let data;
      try {
        data = await utils.getData(`https://api.merkl.xyz/v4/opportunities?chainId=${chainId}&status=LIVE&items=100&page=${pageI}`);
      } catch (err) {
        console.log('failed to fetch Merkl data on chain ' + chain);
      }

      if (data.length === 0) {
        break;
      }

      pools.push(...data);
      pageI++;
    }

    for (const pool of pools.filter(x => !x.protocol || !protocolsBlacklist.includes(x.protocol.id) || poolsWhitelist.includes(x.identifier))) {
      try {
        const poolAddress = pool.identifier;

        const symbol = pool.tokens.map(x => x.symbol).join('-');
        const underlyingTokens = pool.tokens.map(x => x.address)
  
        const tvlUsd = pool.tvl;
        
        const rewardTokens = pool.rewardsRecord?.breakdowns.map(x => x.token.address) || []
        const apyReward = pool.apr;
  
        if (apyReward && apyReward > 0 && tvlUsd && tvlUsd > 0 && chain && rewardTokens.length > 0) {
          const poolData = {
            pool: poolAddress,
            chain: chain,
            project: project,
            symbol: symbol,
            tvlUsd: tvlUsd,
            apyReward: apyReward,
            rewardTokens: [...new Set(rewardTokens)],
            underlyingTokens: underlyingTokens,
          };
          poolsData.push(poolData);
        }
      } catch {}
    }
  }
  return poolsData.filter((p) => utils.keepFinite(p));
};

/*
main().then((data) => {
  console.log(data);
});
*/

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://merkl.angle.money/claim',
};
