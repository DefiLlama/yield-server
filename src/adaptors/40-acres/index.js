const sdk = require('@defillama/sdk');

const utils = require('../utils');

async function getVault(timestamp, address, network, symbol, underlyingToken) {
    const vaultInfo = await utils.getERC4626Info(address, network, timestamp);
    const { tvl, ...rest } = vaultInfo;
    return {
        ...rest,
        project: '40-acres',
        symbol,
        tvlUsd: tvl / 1e6,
        underlyingTokens: [underlyingToken],
    };
};

const apy = async (timestamp) => {
    const fortyAcresBasevault = await getVault(
        timestamp,
        '0xB99B6dF96d4d5448cC0a5B3e0ef7896df9507Cf5',
        'base',
        '40base-USDC-Vault',
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
    );

    const fortyAcresOpvault = await getVault(
        timestamp,
        '0x08dCDBf7baDe91Ccd42CB2a4EA8e5D199d285957',
        'optimism',
        '40op-USDC-Vault',
        '0x0b2c639c533813f4aa9d7837caf62653d097ff85'
    );

    return [fortyAcresBasevault, fortyAcresOpvault];
};

module.exports = {
  timetravel: true,
  apy,
  url: 'https://www.40acres.finance/',
};