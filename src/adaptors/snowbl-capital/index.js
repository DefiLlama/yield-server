const utils = require('../utils');

const apy = async (timestamp) => {
  const snowblVault = await utils.getERC4626Info(
    '0xd61bfc9ca1d0d2b03a3dd74e2ab81df8e5f606e8',
    'base',
    timestamp
  );

  const { tvl, ...rest } = snowblVault;

  return [
    {
      ...rest,
      project: 'snowbl-capital',
      symbol: 'USDC',
      tvlUsd: tvl / 1e6,
      underlyingTokens: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
      poolMeta: 'Snowbl Capital USDC Vault',
      url: 'https://snowbl.capital',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://snowbl.capital',
};
