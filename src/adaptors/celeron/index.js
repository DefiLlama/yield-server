const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { ethers } = require('ethers');

const DATA_ADDRESS = '0x3306597d0eAba6e753FDEF4FB689Fe46449D3920';
const CHAIN = 'berachain';

async function apy() {
  let farmAddresses = (
    await sdk.api.abi.call({
      target: DATA_ADDRESS,
      abi: abi.getFarmAddressInfos,
      chain: CHAIN,
    })
  ).output;

  let poolTvlMapping = new Map();

  for (let farmAddress of farmAddresses) {
    let result = (
      await sdk.api.abi.call({
        target: farmAddress,
        abi: abi.getTvl,
        chain: CHAIN,
      })
    ).output;
    poolTvlMapping.set(farmAddress.toLowerCase(), result);
  }

  let pools = (
    await sdk.api.abi.call({
      target: DATA_ADDRESS,
      abi: abi.getPoolInfos,
      chain: CHAIN,
    })
  ).output;

  let priceFlag = pools
    .map((item) => {
      return `${CHAIN}:${item.asset},${CHAIN}:${item.reward}`;
    })
    .join(',');

  let { coins } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceFlag}`
  );

  let data = pools.map((pool) => {
    let poolTvl = poolTvlMapping
      .get(pool.farmAddress.toLowerCase())
      .find((item) => item.pid == pool.pid);

    let tvl = parseFloat(
      ethers.utils.formatUnits(poolTvl.tvl, pool.assetDecimals)
    );
    let reward = pool.rewardAmount;

    let assetPrice = coins[`berachain:${pool.asset}`].price;
    let rewardPrice = coins[`berachain:${pool.reward}`].price;
    let apy =
      tvl == 0 ? 0 : ((rewardPrice * reward * 365) / (tvl * assetPrice)) * 100;
    return {
      chain: CHAIN,
      pool: pool.farmAddress,
      symbol: pool.assetSymbol,
      underlyingTokens: [pool.asset],
      tvlUsd: tvl * assetPrice,
      apyBase: apy,
      url: `https://celeron.xyz/vault`,
      project: 'celeron',
    };
  });
  return utils.removeDuplicates(data);
}

let abi = {
  getFarmAddressInfos: 'function getFarmAddressInfos() view returns(address[])',
  getPoolInfos:
    'function getPoolInfos() public view returns(tuple(uint256 pid,address farmAddress, address asset, string assetSymbol, uint256 assetDecimals, address reward, uint256 rewardDecimals, uint256 rewardAmount)[])',
  getTvl:
    'function getPoolTotalTvl() view returns (tuple(uint256 pid, address assets, uint256 tvl)[])',
};

module.exports = {
  apy,
  url: 'https://celeron.xyz/',
};
