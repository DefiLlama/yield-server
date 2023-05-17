const sdk = require('@defillama/sdk');
const { data } = require('../pepeteam-swaves/waves');
const { pool } = require('../rocifi-v2/abi');
const { chain } = require('../sommelier/config');
const utils = require('../utils');
const { da } = require('date-fns/locale');
const { toString } = require('../aave-v2/abiLendingPool');

const chainIds = {
  Ethereum: 1,
  Polygon: 137,
  Optimism: 10,
  Arbitrum: 42161,
};

// function getting all the data from the Angle API
const main = async () => {
  var poolsData = [];
  for (const chain in chainIds) {
    const data = await utils.getData(
      'https://api.angle.money/v1/merkl?chainId=' + chainIds[chain]
    );
    const project = 'merkl';

    for (const pool in data.pools) {
      const poolAddress = pool;
      const distributionData = data.pools[poolAddress].distributionData; // array with distribution data

      // filter past distributions
      let liveDistributionsData = distributionData.filter(
        (element) => element.end * 1000 > Date.now()
      );

      // if at least one live distribution, load pool data
      if (liveDistributionsData.length > 0) {
        const tvlUsd = data.pools[poolAddress].tvl;
        const symbol =
          data.pools[poolAddress].tokenSymbol0 +
          '-' +
          data.pools[poolAddress].tokenSymbol1;
        const underlyingTokens = [
          data.pools[poolAddress].token0,
          data.pools[poolAddress].token1,
        ];
        const rewardToken = [];
        liveDistributionsData.forEach((element) => {
          rewardToken.push(element.token);
        });
        const apyReward = data.pools[poolAddress].meanAPR;

        const poolData = {
          pool: poolAddress,
          chain: chain,
          project: project,
          symbol: symbol,
          tvlUsd: tvlUsd,
          apyReward: apyReward ?? 0,
          rewardTokens: rewardToken,
          underlyingTokens: underlyingTokens,
        };
        poolsData.push(poolData);
      } else {
        // do nothing
      }
    }
  }
  return poolsData;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://merkl.angle.money/claim',
};
