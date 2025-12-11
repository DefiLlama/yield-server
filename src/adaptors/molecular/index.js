const sdk = require('@defillama/sdk');
const utils = require('../utils');

const POOL_APY_INFO_ADDRESS = '0xFa91728CD4E0E6aD91494118c922c9d68302DE37';

async function apy() {
  let chain = 'arbitrum';
  let allPools = (
    await sdk.api.abi.call({
      target: POOL_APY_INFO_ADDRESS,
      abi: abi.getAllPoolInfo,
      chain,
    })
  ).output;

  let coinsKey = allPools.map((pool) => `${chain}:${pool.asset}`);
  let { coins } = await utils.getData(
    `https://coins.llama.fi/prices/current/${coinsKey}`
  );

  let farmToTvls = {};
  let farmAddresses = {};
  allPools
    .map((item) => item.farmAddress)
    .forEach((item) => {
      farmAddresses[item] = {};
    });

  for (let item of Object.keys(farmAddresses)) {
    let result = (
      await sdk.api.abi.call({
        target: item,
        abi: abi.getPoolTotalTvl,
        chain,
      })
    ).output;
    farmToTvls[item.toLowerCase()] = result;
  }

  let d = allPools
    .map((pool) => {
      let tvlInfo = farmToTvls[pool.farmAddress.toLowerCase()].find(
        (item) => item.pid == pool.pid
      );
      let tvl = tvlInfo.tvl / 10 ** pool.assetDecimals;
      let price = coins[`${chain}:${pool.asset}`].price;
      let tvlPrice = tvl * price;
      let apy = pool.apy / 10 ** 16;
      return {
        chain,
        pool: `${pool.farmAddress}-${pool.asset}`,
        symbol: pool.assetSymbol,
        underlyingTokens: [pool.asset],
        tvlUsd: tvlPrice,
        apyBase: apy,
        url: `https://molecular.finance/vault/${pool.farmAddress}/${pool.asset}`,
        project: 'molecular',
      };
    })
    .filter((item) => item.tvlUsd > 10000);
  return d;
}

let abi = {
  getPoolTotalTvl:
    'function getPoolTotalTvl() view returns (tuple(uint256 pid, address assets, uint256 tvl)[])',
  getAllPoolInfo:
    'function getAllPoolInfo() view returns (tuple(uint256 pid, address farmAddress, address asset, string assetSymbol, uint256 assetDecimals, address reward, uint256 apy)[])',
};

module.exports = {
  apy: apy,
  url: 'https://molecular.finance/vault',
};
