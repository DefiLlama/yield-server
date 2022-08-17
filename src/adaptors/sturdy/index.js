const utils = require('../utils');

const poolsFunction = async () => {
  const ftmVaultData = await utils.getData(
    'https://us-central1-stu-dashboard-a0ba2.cloudfunctions.net/getVaultMonitoring'
  );
  const ftmData = ftmVaultData.map((item) => ({
    pool: item.address,
    chain: utils.formatChain('fantom'),
    project: 'sturdy',
    symbol: utils.formatSymbol(item.tokens),
    tvlUsd: item.tvl,
    apy: item.base * 100,
  }));

  const ethVaultData = await utils.getData(
    'https://us-central1-stu-dashboard-a0ba2.cloudfunctions.net/getVaultMonitoring?chain=ethereum'
  );
  const ethData = ethVaultData.map((item) => ({
    pool: item.address,
    chain: utils.formatChain('ethereum'),
    project: 'sturdy',
    symbol: utils.formatSymbol(item.tokens),
    tvlUsd: item.tvl,
    apy: item.base * 100,
  }));
  return [...ftmData, ...ethData];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.sturdy.finance/deposit',
};
