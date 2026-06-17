const utils = require('../utils');
const ethers = require('ethers');

const VAULTS = [
  {
    symbol: 'USDC',
    address: '0x973ae12ac9078e9f9b1708c477a9670bb3fb0886',
    network: 'arbitrum',
    underlyingToken: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    underlyingTokenDecimals: 6,
    poolMeta: 'USDC Dual Grid Vault',
    url: 'https://app.gremlix.xyz/vaults/0x973Ae12aC9078E9f9B1708C477A9670bB3fB0886'
  }
];

const getVaultData = async (timestamp, vault) => {
  const vaultERC4626Info = await utils.getERC4626Info(vault.address, vault.network, timestamp);
  const { tvl, ...rest } = vaultERC4626Info;
  return {
    ...rest,
    project: 'gremlix',
    symbol: vault.symbol,
    underlyingTokens: [vault.underlyingToken],
    tvlUsd: parseFloat(ethers.utils.formatUnits(tvl, vault.underlyingTokenDecimals)),
    poolMeta: vault.poolMeta,
    url: vault.url
  };
};

const apy = async (timestamp) => {
  return Promise.all(VAULTS.map(vault => getVaultData(timestamp, vault)));
};

module.exports = {
  protocolId: '7825',
  timetravel: false,
  apy,
  url: 'https://app.gremlix.xyz'
};