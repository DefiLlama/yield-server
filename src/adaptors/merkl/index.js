const sdk = require('@defillama/sdk');
const { data } = require('../pepeteam-swaves/waves');
const { pool } = require('../rocifi-v2/abi');
const { chain } = require('../sommelier/config');
const utils = require('../utils');
const { da } = require('date-fns/locale');
const { toString } = require('../aave-v2/abiLendingPool');
const address = require('../paraspace-lending/address');

const chainIds = {
  ethereum: 1,
  polygon: 137,
  optimism: 10,
  arbitrum: 42161,
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

      // if at least one live distribution, find and load pool data
      // else, do nothing and move to the next pool
      if (liveDistributionsData.length > 0) {
        const symbol =
          data.pools[poolAddress].tokenSymbol0 +
          '-' +
          data.pools[poolAddress].tokenSymbol1;
        const underlyingTokens = [
          data.pools[poolAddress].token0,
          data.pools[poolAddress].token1,
        ];

        // TVL from the API
        const tvlUsd = data.pools[poolAddress].tvl;

        /* Trying to fetch tvl on-chain: query balances of the pool and price of both tokens
        remaining to-do: 
          - generalize the fetching of amount balances and prices
          - get the prices of tokens generalized, including agEUR one
        */

        const amountUsdOnChain0 = (
          await sdk.api.abi.call({
            target: underlyingTokens[0],
            abi: 'erc20:balanceOf',
            params: poolAddress,
            chain: chain,
          })
        ).output;

        const decimalsToken0 = (
          await sdk.api.abi.call({
            target: underlyingTokens[0],
            abi: 'erc20:decimals',
            chain: chain,
          })
        ).output;

        const priceToken0 = (
          await utils.getPrices([underlyingTokens[0]], chain)
        ).pricesByAddress[underlyingTokens[0].toLowerCase()];

        const tvlUsdOnChain0 =
          (amountUsdOnChain0 / 10 ** decimalsToken0) * priceToken0;

        const amountUsdOnChain1 = (
          await sdk.api.abi.call({
            target: underlyingTokens[1],
            abi: 'erc20:balanceOf',
            params: poolAddress,
            chain: chain,
          })
        ).output;

        const decimalsToken1 = (
          await sdk.api.abi.call({
            target: underlyingTokens[1],
            abi: 'erc20:decimals',
            chain: chain,
          })
        ).output;

        const priceToken1 = (
          await utils.getPrices([underlyingTokens[1]], chain)
        ).pricesByAddress[underlyingTokens[1].toLowerCase()];

        const tvlUsdOnChain1 =
          (amountUsdOnChain1 / 10 ** decimalsToken1) * priceToken1;

        console.log(
          data.pools[poolAddress].tokenSymbol0.toLowerCase(),
          data.pools[poolAddress].tokenSymbol1.toLowerCase(),
          amountUsdOnChain0,
          amountUsdOnChain1,
          decimalsToken0,
          decimalsToken1,
          priceToken0,
          priceToken1,
          tvlUsdOnChain0,
          tvlUsdOnChain1
        );

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
  //return poolsData;
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
