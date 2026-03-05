const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const sdk = require('@defillama/sdk');

let tokenInfoMapping = {};

const AGGREGATOR_ADDRESS = '0x6bD057Dae9aA5aE05c782F2eB988CBdE53Be9620';
const POOL_INFOS_ADDRESS = '0x0099A786a41b0b7b11E326Eb1d8FE84f9337548F';

async function apy() {
  let abi = sdk.api.abi;
  let { output: poolTvlInfos } = await abi.call({
    target: AGGREGATOR_ADDRESS,
    abi: abiJSON.getPoolTvl,
    chain: 'linea',
  });
  let { output: poolApyInfos } = await abi.call({
    target: POOL_INFOS_ADDRESS,
    abi: abiJSON.getAllPools,
    chain: 'linea',
  });
  let priceKeys = Array.from(
    new Set(
      poolApyInfos.flatMap((item) => [
        `linea:${item.asset}`,
        `linea:${item.reward}`,
      ])
    )
  );
  let { coins } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys.join(',').toLowerCase()}`
  );

  let poolTvlInfoMap = {};
  for (const poolTvl of poolTvlInfos) {
    poolTvlInfoMap[poolTvl.pid] = poolTvl.tvl;
  }

  return poolApyInfos.map((poolApy) => {
    let tvl = poolTvlInfoMap[poolApy.pid];
    let coin = coins[`linea:${poolApy.asset}`.toLocaleLowerCase()];
    if (coin === undefined || tvl === undefined) {
      return undefined;
    }
    let apy;
    let tvlUsd = BigNumber(tvl)
      .div(Math.pow(10, poolApy.assetDecimals))
      .multipliedBy(coin.price)
      .toNumber();
    tvlUsd = parseFloat(tvlUsd.toFixed(2));

    if (poolApy.isFixedRate) {
      apy = poolApy.fixedRate / 100;
    } else {
      let rewardCoin = coins[`linea:${poolApy.reward}`.toLocaleLowerCase()];
      if (rewardCoin === undefined) {
        return undefined;
      }

      apy =
        tvlUsd === 0
          ? 0
          : (BigNumber(poolApy.rewardAmount)
              .div(Math.pow(10, poolApy.rewardDecimals))
              .multipliedBy(rewardCoin.price) *
              365) /
            tvlUsd;
      apy = parseFloat((apy * 100).toFixed(2));
    }

    return {
      chain: 'linea',
      project: 'bagful',
      pool: poolApy.farmAddress,
      symbol: poolApy.assetSymbol,
      underlyingTokens: [poolApy.asset],
      tvlUsd,
      apy,
      url: `https://bagful.io/vault/${poolApy.farmAddress}/${poolApy.asset}`,
    };
  });
}

let abiJSON = {
  getPoolTvl:
    'function getPoolTotalTvl() view returns (tuple(uint256 pid, address poolAddress,address poolAssets, uint256 tvl)[])',
  getAllPools:
    'function getAllPools() view returns (tuple(uint256 pid, address asset, string assetSymbol, uint256 assetDecimals, address farmAddress, bool isFixedRate, uint256 fixedRate, address reward, uint256 rewardDecimals, uint256 rewardAmount)[])',
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://bagful.io',
};
