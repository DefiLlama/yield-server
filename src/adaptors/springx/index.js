const { api } = require('@defillama/sdk');
const utils = require('../utils');

const CONTRACT_ADDRESS = '0xAfCf702c1bA93F48c39dF5CdF5Bffe780B705d1c';

async function apy() {
  const chain = 'monad';
  const pools = (
    await api.abi.call({
      target: CONTRACT_ADDRESS,
      abi: abi.getInfo,
      chain,
    })
  ).output;

  const coinsKey = pools.map((pool) => `${chain}:${pool.asset}`);
  const { coins } = await utils.getPriceApiData(`/prices/current/${coinsKey}`);

  const farmToTvls = {};
  const farmAddresses = {};
  pools
    .map((item) => item.farmAddress)
    .forEach((item) => {
      farmAddresses[item] = {};
    });

  for (const item of Object.keys(farmAddresses)) {
    const result = (
      await api.abi.call({
        target: item,
        abi: abi.getTvl,
        chain,
      })
    ).output;
    farmToTvls[item.toLowerCase()] = result;
  }

  const d = pools
    .map((pool) => {
      const tvlRows = farmToTvls[pool.farmAddress.toLowerCase()] ?? [];
      const tvlInfo = tvlRows.find((item) => item.pid === pool.pid);
      const price = coins?.[`${chain}:${pool.asset}`]?.price;
      if (!tvlInfo || !price) return null;

      const tvl = tvlInfo.tvl / 10 ** pool.assetDecimals;

      const tvlPrice = tvl * price;
      const apy = pool.apy / 10 ** 16;
      return {
        chain,
        pool: `${pool.farmAddress}-${pool.pid}`.toLowerCase(),
        symbol: pool.assetSymbol,
        underlyingTokens: [pool.asset],
        tvlUsd: tvlPrice,
        apyBase: apy,
        url: `https://springx.finance/Vault/${pool.farmAddress}/${pool.asset}`,
        project: 'springx',
      };
    })
    .filter((pool) => pool !== null);
  return d;
}

const abi = {
  getTvl:
    'function getPoolTotalTvl() view returns (tuple(uint256 pid, address assets, uint256 tvl)[])',
  getInfo:
    'function getAllPoolInfo() view returns (tuple(uint256 pid, address farmAddress, address asset, string assetSymbol, uint256 assetDecimals, address reward, uint256 apy)[])',
};

module.exports = {
  protocolId: '7748',
  apy: apy,
  url: 'https://springx.finance/Vault',
};
