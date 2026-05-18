const { api } = require('@defillama/sdk');
const utils = require('../utils');

const CONTRACT_ADDRESS = '0x04B6E42eBD94beD6AbFE18B0077d3E0614E3085a';

async function apy() {
  let chain = 'plasma';
  let pools = (
    await api.abi.call({
      target: CONTRACT_ADDRESS,
      abi: abi.getInfo,
      chain,
    })
  ).output;

  let coinsKey = pools.map((pool) => `${chain}:${pool.asset}`);
  let { coins } = await utils.getData(
    `https://coins.llama.fi/prices/current/${coinsKey}`
  );

  let farmToTvls = {};
  let farmAddresses = {};
  pools
    .map((item) => item.farmAddress)
    .forEach((item) => {
      farmAddresses[item] = {};
    });

  for (let item of Object.keys(farmAddresses)) {
    let result = (
      await api.abi.call({
        target: item,
        abi: abi.getTvl,
        chain,
      })
    ).output;
    farmToTvls[item.toLowerCase()] = result;
  }

  let d = pools
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
        pool: pool.farmAddress,
        symbol: pool.assetSymbol,
        underlyingTokens: [pool.asset],
        tvlUsd: tvlPrice,
        apyBase: apy,
        url: `https://springx.finance/Vault/${pool.farmAddress}/${pool.asset}`,
        project: 'springx',
      };
    })
    .filter((item) => item.tvlUsd > 10000);
  return d;
}

let abi = {
  getTvl:
    'function getPoolTotalTvl() view returns (tuple(uint256 pid, address assets, uint256 tvl)[])',
  getInfo:
    'function getAllPoolInfo() view returns (tuple(uint256 pid, address farmAddress, address asset, string assetSymbol, uint256 assetDecimals, address reward, uint256 apy)[])',
};

module.exports = {
  apy: apy,
  url: 'https://springx.finance/Vault',
};
