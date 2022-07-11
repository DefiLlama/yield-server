const utils = require('../utils');

const poolsFunction = async () => {
    const dksdData = await utils.getData(
        'https://prod.kokoa-api.com/earn/status'
    ); //dKSD is a tokenized version of deposited KSD that is dynamically balanced at the APY rate

    const earnPool = {
        pool: `0x5e6215dfb33b1fb71e48000a47ed2ebb86d5bf3d`, //dKSD pool address
        chain: utils.formatChain('klaytn'),
        project: 'Kokoa Finance',
        symbol: utils.formatSymbol('KSD'), //Users deposit KSD and claims the realized APY upon withdrawal
        tvlUsd: Number(dksdData.dKsdTotalSupply),
        apy: Number(dksdData.apy),
    };

    return [earnPool]; // Kokoa Finance Earn pool(the only pool) accrues APY yields via collateral management yields
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
};