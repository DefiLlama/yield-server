const sdk = require('@defillama/sdk');
const utils = require('../utils');

const networks = {
  1: 'ethereum',
  137: 'polygon',
  10: 'optimism',
  42161: 'arbitrum',
};

async function getRateAngle(token) {
  const prices = await utils.getData('https://api.angle.money/v1/prices/');
  const price = prices.filter((p) => p.token == token)[0].rate;
  return price;
}

// function getting all the data from the Angle API
const main = async () => {
  var poolsData = [];

  let data;
  try {
    data = await utils.getData('https://api.angle.money/v1/merkl');
  } catch (err) {
    console.log('no data for Merk');
  }
  const project = 'merkl';

  for (const pool in data.pools) {
    const poolAddress = pool;
    const chainId = data.pools[poolAddress].chainId;
    const chain = networks[chainId];
    const distributionData = data.pools[poolAddress].distributionData; // array with distribution data

    // filter past distributions
    let liveDistributionsData = distributionData.filter(
      (element) => element.end * 1000 > Date.now()
    );

    // if at least one live distribution, find and load pool data
    // else, do nothing and move to the next pool
    if (liveDistributionsData.length > 0) {
      try {
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

        // Trying to fetch tvl on-chain: query balances of the pool and price of both tokens

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

        const priceToken0 =
          (await utils.getPrices([underlyingTokens[0]], chain)).pricesByAddress[
            underlyingTokens[0].toLowerCase()
          ] ?? getRateAngle(data.pools[poolAddress].tokenSymbol0);

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

        const priceToken1 =
          (await utils.getPrices([underlyingTokens[1]], chain)).pricesByAddress[
            underlyingTokens[1].toLowerCase()
          ] ?? (await getRateAngle(data.pools[poolAddress].tokenSymbol1));

        const tvlUsdOnChain =
          (amountUsdOnChain0 / 10 ** decimalsToken0) * priceToken0 +
          (amountUsdOnChain1 / 10 ** decimalsToken1) * priceToken1;

        const rewardToken = [];
        liveDistributionsData.forEach((element) => {
          rewardToken.push(element.token);
        });
        const apyReward = data.pools[poolAddress].meanAPR;

        if (apyReward && apyReward > 0) {
          const poolData = {
            pool: poolAddress,
            chain: chain,
            project: project,
            symbol: symbol,
            tvlUsd: tvlUsd,
            apyReward: apyReward,
            rewardTokens: [...new Set(rewardToken)],
            underlyingTokens: underlyingTokens,
          };
          console.log(poolData);
          poolsData.push(poolData);
        }
      } catch {}
      //console.log(poolsData);
    } else {
      continue;
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
