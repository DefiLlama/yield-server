const utils = require('../utils');

const poolsFunction = async () => {
  const vaultData = await utils.getData('https://api.robo-vault.com/vaults');

  return vaultData
    .filter((p) => p.status.toLowerCase() === 'active')
    .map((item) => ({
      pool: item.addr,
      chain: utils.formatChain(item.chain),
      project: 'robo-vault',
      symbol: utils.formatSymbol(item.symbol).replace('sAMM-', ''),
      tvlUsd: item.tvlUsd,
      apyBase: item.apy7d * 100,
    }));
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://www.robo-vault.com/',
};
