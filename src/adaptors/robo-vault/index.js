const utils = require('../utils');

isActive= (item) =>{
  return item.status.toLowerCase() == "active" || item.status.toLowerCase() == "test";
}

filter = (vault) => {
  var filtered = vault.filter( isActive );
  return filtered;
}

const poolsFunction = async () => {
  const vaultData = await utils.getData('https://api.robo-vault.com/vaults');
  const poolData = filter(vaultData);

  return poolData.map(item => ({
      pool: item.addr,
      chain: utils.formatChain(item.chain),
      project: 'robo-vault',
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