const utils = require('../utils');

const poolsFunction = async () => {
  const vaultData = await utils.getData('https://us-central1-stu-dashboard-a0ba2.cloudfunctions.net/getVaultMonitoring');
  return vaultData.map(item => ({
      pool: item.address,
      chain: utils.formatChain('fantom'),
      project: 'sturdy',
      symbol: utils.formatSymbol(item.tokens),
      tvlUsd: item.tvl,
      apy: item.base * 100,
    })
  );
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};