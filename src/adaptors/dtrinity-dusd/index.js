const sdk = require('@defillama/sdk');

const utils = require('../utils');

const apy = async (timestamp) => {
  const sdusdSonic = await utils.getERC4626Info(
    '0x41a5477364BF60d8936b90310FecFDa79593304E',
    'sonic',
    timestamp
  );
  const { tvl: sdusdSonicTVL, ...restSdusdSonic } = sdusdSonic;
  const sdusdSonicVault = {
    ...restSdusdSonic,
    project: 'dtrinity-dusd',
    symbol: `sDUSD`,
    tvlUsd: sdusdSonicTVL / 1e18,
    underlyingTokens: ['0x53a6aBb52B2F968fA80dF6A894e4f1b1020DA975'],
  };

  const sdusdFraxtal = await utils.getERC4626Info(
    '0x58AcC2600835211Dcb5847c5Fa422791Fd492409',
    'fraxtal',
    timestamp
  );
  const { tvl: sdusdFraxtalTVL, ...restSdusdFraxtal } = sdusdFraxtal;
  const sdusdFraxtalVault = {
    ...restSdusdFraxtal,
    project: 'dtrinity-dusd',
    symbol: `sDUSD`,
    tvlUsd: sdusdFraxtalTVL / 1e6,
    underlyingTokens: ['0x788D96f655735f52c676A133f4dFC53cEC614d4A'],
  };

  const sdusdEthereum = await utils.getERC4626Info(
    '0x7CB20517776636eD76b68EdB3D99DCce356ABf02',
    'ethereum',
    timestamp
  );
  const { tvl: sdusdEthereumTVL, ...restSdusdEthereum } = sdusdEthereum;
  const sdusdEthereumVault = {
    ...restSdusdEthereum,
    project: 'dtrinity-dusd',
    symbol: `sDUSD`,
    tvlUsd: sdusdEthereumTVL / 1e18,
    underlyingTokens: ['0x07fFf99e1664d9B116fbC158c0E99785F81cA236'],
  };

  return [sdusdSonicVault, sdusdFraxtalVault, sdusdEthereumVault];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.dtrinity.org/dstake/vault/',
};
