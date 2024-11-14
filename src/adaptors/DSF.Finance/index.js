const utils = require('../utils');
const dsfPoolStables = '0x22586ea4fdaa9ef012581109b336f0124530ae69';

const collectPools = async () => {
  const data = await utils.getData('https://api2.dsf.finance/api/total-apy-tvl');
  const info = data['data']['info'];

  return [
    {
      pool: `${dsfPoolStables}-ethereum`,
      chain: utils.formatChain('ethereum'),
      project: 'dsf.finance',
      symbol: 'USDT-USDC-DAI',
      tvlUsd: info['tvl'],
      apy: info['apy'],
      rewardTokens: null,
      underlyingTokens: ['0xdAC17F958D2ee523a2206206994597C13D831ec7', '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0x6B175474e89094C44Da98b954EedeAC495271d0F'],
      url: 'https://app.dsf.finance/',
    }
  ];
};

module.exports = {
  timetravel: false,
  apy: collectPools,
  url: 'https://dsf.finance/',
};
