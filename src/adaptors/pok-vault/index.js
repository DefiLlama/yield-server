const ethers = require('ethers');
const utils = require('../utils');

const POK_VAULT_ADDRESS = "0x5a791CCAB49931861056365eBC072653F3FA0ba0";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

const apy = async (timestamp) => {
    const {tvl, ...pokVaultInfo} = await utils.getERC4626Info(POK_VAULT_ADDRESS, 'bsc', timestamp);

    return [{... pokVaultInfo, project: 'pok-vault', symbol: 'POK-USDT', tvlUsd: Number(ethers.utils.formatEther(tvl)), underlyingTokens: [USDT_ADDRESS]}];
};

module.exports = {
    timetravel: true,
    apy,
    url: 'https://pokvault.xyz/',
};