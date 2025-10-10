const axios = require('axios');
const utils = require('../utils');

const getApy = async () => {
    const body = {"page": 0,"pageSize": 100};
    const vaultApys = [];
    const vaults = (await axios.post(`https://tars.loopscale.com/v1/markets/lending_vaults/stats`, body)).data;

    for (const vault of vaults) {
        vaultApys.push({
            pool: vault.vaultAddress,
            chain: 'Solana',
            project: 'loopscale',
            symbol: utils.formatSymbol(vault.vaultSymbol),
            underlyingTokens: [vault.principalMint],
            tvlUsd: Number(vault.principalDepositsUsd - vault.principalDeployedUsd),
            url: `https://app.loopscale.com/vault/${vault.vaultAddress}`,
            apyBase: Number(vault.apy),
            apyReward: Number(vault.rewardsApy),
            totalSupplyUsd: Number(vault.principalDepositsUsd),
            totalBorrowUsd: Number(vault.principalDeployedUsd),
            rewardTokens: vault.rewardsMints,
        });
    }

    return vaultApys;
};

module.exports = {
    apy: getApy,
    url: 'https://app.loopscale.com/',
};
