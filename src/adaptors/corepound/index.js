const { api } = require('@defillama/sdk');
const utils = require('../utils');
const { ethers } = require('ethers');

const FARM_INFO_ADDRESS = '0xbF0E495DDC51B9f25D1Dc14643831Ee249017507';
const CHAIN = 'CORE';

async function apy() {
  let { output: farmAddresses } = await api.abi.call({
    target: FARM_INFO_ADDRESS,
    abi: abiInfo.getAllFarmAddress,
    chain: CHAIN,
  });

  let { output: poolTvlsOut } = await api.abi.multiCall({
    calls: farmAddresses.map((address) => ({ target: address })),
    abi: abiInfo.getTotalTvl,
    chain: CHAIN,
  });
  let tvlMap = poolTvlsOut.reduce(function (prevData, poolTvls) {
    prevData[poolTvls.input.target] = poolTvls.output;
    return prevData;
  }, {});

  let { output: poolInfos } = await api.abi.call({
    target: FARM_INFO_ADDRESS,
    abi: abiInfo.getPoolInfos,
    chain: CHAIN,
  });

  let priceInfo = poolInfos
    .map((pool) => {
      return `${CHAIN}:${pool.asset}`;
    })
    .join(',');

  let { coins } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceInfo}`
  );

  let { tokenPrices } = await utils.getData(
    'https://corepound.xyz/farmData.json'
  );
  let rewardPrice = tokenPrices['CORP'];

  let apyInfos = poolInfos
    .map((poolInfo) => {
      if (tvlMap[poolInfo.farmAddress] === undefined) {
        return undefined;
      }
      let target = tvlMap[poolInfo.farmAddress].find(
        (item) => item.pid === poolInfo.pid
      );

      if (
        target === undefined ||
        coins[`${CHAIN}:${poolInfo.asset}`] === undefined
      ) {
        return undefined;
      }

      let tvl = target.tvl / Math.pow(10, poolInfo.decimals);
      let apy =
        tvl === 0
          ? 0
          : ((rewardPrice * poolInfo.rewardAmount * 365) /
              (tvl * coins[`${CHAIN}:${poolInfo.asset}`].price)) *
            100;

      return {
        chain: CHAIN,
        pool: poolInfo.farmAddress,
        symbol: poolInfo.symbol,
        underlyingTokens: [poolInfo.asset],
        tvlUsd: tvl * coins[`${CHAIN}:${poolInfo.asset}`].price,
        apyBase: apy,
        url: `https://corepound.xyz/vault`,
        project: 'corepound',
      };
    })
    .filter((item) => item !== undefined && item.tvlUsd >= 10000);

  return utils.removeDuplicates(apyInfos);
}

let abiInfo = {
  getAllFarmAddress: 'function getAllFarmAddresses() view returns(address[])',
  getTotalTvl:
    'function getTotalTvl() view returns (tuple(uint256 pid, address assets, uint256 tvl)[])',
  getPoolInfos:
    'function getAllPoolInfo() view returns (tuple(uint256 pid, address farmAddress, address asset, uint8 decimals, string symbol, uint256 rewardAmount)[])',
  slot0:
    'function slot0() external view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)',
};

module.exports = {
  apy,
};
