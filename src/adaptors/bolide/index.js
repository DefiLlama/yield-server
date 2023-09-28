const utils = require('../utils');

const MASTER_CHEF = '0x3782C47E62b13d579fe748946AEf7142B45B2cf7';

const poolsFunction = async () => {
  const data = await utils.getData('https://bolide.fi/api/v1/vaults/list');

  const pools = [];

  for (const vault of data.vaults) {
    for (const token of vault.tokens) {
      let poolAddress;

      if (vault.address === MASTER_CHEF) {
        if (token.name === 'BLID') {
          poolAddress = `${vault.address}0`;
        } else {
          poolAddress = `${vault.address}1`;
        }
      } else {
        poolAddress = `${vault.address}${token.name}`;
      }

      pools.push({
        pool: poolAddress,
        chain: getChainNameById(vault.chainId),
        project: 'bolide',
        symbol: token.name,
        tvlUsd: token.tvl,
        apy: vault.baseApy,
      });
    }
  }

  return pools.filter((p) => p.chain);
};

const getChainNameById = (chainId) => {
  switch (chainId) {
    case 1:
      return 'ethereum';
    case 56:
      return 'binance';
    case 137:
      return 'polygon';
  }
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.bolide.fi/#/',
};
