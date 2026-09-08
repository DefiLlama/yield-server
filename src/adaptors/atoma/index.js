const utils = require('../utils');
const ethers = require('ethers');

const USDC_ARBITRUM = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';

const VAULTS = [
  {
    symbol: 'USDC',
    address: '0xCC56410e1a136aF0eCEb7241c6aE394F4d8b581c',
    network: 'arbitrum',
    underlyingToken: USDC_ARBITRUM,
    underlyingTokenDecimals: 6,
    poolMeta: 'Extended x Nado',
  },
  {
    symbol: 'USDC',
    address: '0x1C788E14d8e5B446e3F71B5142e2edaBcAB36da1',
    network: 'arbitrum',
    underlyingToken: USDC_ARBITRUM,
    underlyingTokenDecimals: 6,
    poolMeta: 'Lighter x Trade[XYZ]',
  },
];

const getVaultData = async (timestamp, vault) => {
  const vaultERC4626Info = await utils.getERC4626Info(vault.address, vault.network, timestamp);
  const { tvl, ...rest } = vaultERC4626Info;
  return {
    ...rest,
    project: 'atoma',
    symbol: vault.symbol,
    underlyingTokens: [vault.underlyingToken],
    tvlUsd: parseFloat(ethers.utils.formatUnits(tvl, vault.underlyingTokenDecimals)),
    poolMeta: vault.poolMeta,
    url: 'https://app.atoma.fi/',
  };
};

const apy = async (timestamp) => {
  return Promise.all(VAULTS.map((vault) => getVaultData(timestamp, vault)));
};

module.exports = {
  protocolId: '8300',
  timetravel: false,
  apy,
  url: 'https://app.atoma.fi/',
};
