const sdk = require('@defillama/sdk');

const utils = require('../utils');

const apy = async (timestamp) => {
  const sdusd = await utils.getERC4626Info(
    '0x41a5477364BF60d8936b90310FecFDa79593304E',
    'sonic',
    timestamp
  );
  const { tvl: sdusdTVL, ...restSdusd } = sdusd;
  const sdusdvault = {
    ...restSdusd,
    project: 'dtrinity-dusd',
    symbol: `sDUSD`,
    tvlUsd: sdusdTVL / 1e18,
    underlyingTokens: ['0x53a6aBb52B2F968fA80dF6A894e4f1b1020DA975'],
  };

  return [sdusdvault];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.dtrinity.org/dstake/vault/',
};
