const utils = require('../utils');

const poolsFunction = async () => {
  const vaultDataFantom = await utils.getData('http://api.robo-vault.com/vaults/fantom');
  const vaultDataPolygon = await utils.getData('api.robo-vault.com/vaults/polygonm');
  const poolData = vaultDataFantom.concat(vaultDataPolygon);

  return poolData.map(item => ({
      pool: item.addr,
      chain: utils.formatChain(item.chain),
      project: 'robovault',
      symbol: utils.formatSymbol(item.symbol),
      tvlUsd: item.tvlUsd,
      apy: item.apy3d * 100,
    })
  );
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};