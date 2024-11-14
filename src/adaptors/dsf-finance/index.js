const utils = require('../utils');
const dsfPoolStables = '0x22586ea4fdaa9ef012581109b336f0124530ae69';

const collectPools = async () => {
  const data = await utils.getData('https://api2.dsf.finance/api/total-apy-tvl');
  const info = data['data']['info'];

  return [
    {
      pool: `${dsfPoolStables}-ethereum`,
      chain: utils.formatChain('ethereum'),
      project: 'dsf-finance',
      symbol: 'USDT-USDC-DAI',
      tvlUsd: info['tvl'],
      apy: info['apy'],
      url: 'https://app.dsf.finance/',
    }
  ];
};

module.exports = {
  timetravel: false,
  apy: collectPools,
  url: 'https://dsf.finance/',
};
